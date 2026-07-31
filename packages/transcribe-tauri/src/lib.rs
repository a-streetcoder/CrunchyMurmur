//! Tauri 2 desktop adapter for CrunchyMurmur's on-device transcription engine.

use crunchymurmur_transcriber::{
    EngineError, EngineErrorCode, ModelProfile, OnDeviceEngine, TranscriptOutcome, engine_version,
};
use serde::{Deserialize, Serialize};
use std::fmt;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, RwLock};
use tauri::plugin::{Builder, TauriPlugin};
use tauri::{Manager, Runtime, State};

const PLUGIN_NAME: &str = "crunchymurmur-transcribe";

/// Stable errors returned by the Tauri and Rust adapter surfaces.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum TranscriptionErrorCode {
    ModelNotFound,
    ModelInvalid,
    ModelUntrusted,
    ModelNotPrepared,
    AudioInvalid,
    LanguageUnsupported,
    InferenceFailed,
    Internal,
}

/// A serializable, privacy-safe failure returned across Tauri IPC.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TranscriptionError {
    code: TranscriptionErrorCode,
    message: String,
    recoverable: bool,
}

impl TranscriptionError {
    fn new(code: TranscriptionErrorCode, message: impl Into<String>, recoverable: bool) -> Self {
        Self {
            code,
            message: message.into(),
            recoverable,
        }
    }

    /// Returns the stable category applications should branch on.
    pub fn code(&self) -> TranscriptionErrorCode {
        self.code
    }

    /// Reports whether retrying after host or user action may succeed.
    pub fn recoverable(&self) -> bool {
        self.recoverable
    }
}

impl fmt::Display for TranscriptionError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl std::error::Error for TranscriptionError {}

impl From<EngineError> for TranscriptionError {
    fn from(error: EngineError) -> Self {
        let code = match error.code() {
            EngineErrorCode::ModelNotFound => TranscriptionErrorCode::ModelNotFound,
            EngineErrorCode::ModelInvalid => TranscriptionErrorCode::ModelInvalid,
            EngineErrorCode::ModelUntrusted => TranscriptionErrorCode::ModelUntrusted,
            EngineErrorCode::ModelNotPrepared => TranscriptionErrorCode::ModelNotPrepared,
            EngineErrorCode::AudioInvalid => TranscriptionErrorCode::AudioInvalid,
            EngineErrorCode::InferenceFailed => TranscriptionErrorCode::InferenceFailed,
        };
        Self::new(code, error.to_string(), error.recoverable())
    }
}

/// Authenticated local Model Profile used to prepare the engine.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrepareOptions {
    /// Directory containing the authenticated Model Profile and model files.
    pub model_directory: String,
    /// SHA-256 digest of the manifest obtained from a trusted host source.
    pub trusted_manifest_sha256: String,
}

/// Information about a successfully prepared engine.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineInformation {
    /// Semantic version of the linked native transcription engine.
    pub engine_version: String,
    /// Stable model identifier declared by the Model Profile.
    pub model_id: String,
    /// Semantic model version declared by the Model Profile.
    pub model_version: String,
    /// Time spent loading the model, in milliseconds.
    pub load_ms: u64,
    /// Whether the already prepared model instance was reused.
    pub reused: bool,
}

/// A local audio file to transcribe.
#[derive(Debug, Deserialize)]
pub struct AudioInput {
    /// Local path to a WAV-compatible audio file owned by the host.
    pub path: String,
}

/// Options for a transcription request.
#[derive(Debug, Default, Deserialize)]
pub struct TranscribeOptions {
    /// Spoken-language identifier, or `auto` to use automatic handling.
    pub language: Option<String>,
}

/// Successful final transcript classification.
#[derive(Debug, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum Outcome {
    Speech,
    NoSpeech,
}

/// A successful final transcription result.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Transcript {
    /// Normalised final transcript text, empty when no speech was detected.
    pub text: String,
    /// Whether usable speech was detected.
    pub outcome: Outcome,
    /// Time spent running inference, in milliseconds.
    pub inference_ms: u64,
}

/// Privacy-safe state exposed for host diagnostics.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Diagnostics {
    /// Current lifecycle state: `idle` or `ready`.
    pub state: &'static str,
    /// Prepared model identifier, when a model is loaded.
    pub model_id: Option<String>,
    /// Prepared model version, when a model is loaded.
    pub model_version: Option<String>,
    /// Most recent model load duration, in milliseconds.
    pub last_load_ms: Option<u64>,
    /// Most recent inference duration, in milliseconds.
    pub last_inference_ms: Option<u64>,
}

/// Host-owned filesystem roots from which the plugin may read audio.
#[derive(Debug, Clone, Default)]
pub struct PluginConfig {
    allowed_audio_roots: Vec<PathBuf>,
}

impl PluginConfig {
    /// Creates a deny-by-default plugin configuration.
    pub fn new() -> Self {
        Self::default()
    }

    /// Allows audio files beneath an existing host-owned directory.
    pub fn allow_audio_root(mut self, root: impl Into<PathBuf>) -> Self {
        self.allowed_audio_roots.push(root.into());
        self
    }
}

/// Direct Rust service used by the Tauri command adapter.
pub struct TranscriberService {
    engine: OnDeviceEngine,
    allowed_audio_roots: Vec<PathBuf>,
    model_directory: Option<PathBuf>,
    trusted_manifest_sha256: Option<String>,
    model_id: Option<String>,
    model_version: Option<String>,
    languages: Vec<String>,
    last_load_ms: Option<u64>,
    last_inference_ms: Option<u64>,
}

impl Default for TranscriberService {
    fn default() -> Self {
        Self::new()
    }
}

impl TranscriberService {
    /// Creates an idle service without loading a model or touching the microphone.
    pub fn new() -> Self {
        Self::with_audio_roots(std::iter::empty::<PathBuf>())
    }

    /// Creates an idle service restricted to existing host-owned audio roots.
    pub fn with_audio_roots(roots: impl IntoIterator<Item = PathBuf>) -> Self {
        Self {
            engine: OnDeviceEngine::new(),
            allowed_audio_roots: roots
                .into_iter()
                .filter_map(|root| root.canonicalize().ok())
                .collect(),
            model_directory: None,
            trusted_manifest_sha256: None,
            model_id: None,
            model_version: None,
            languages: Vec::new(),
            last_load_ms: None,
            last_inference_ms: None,
        }
    }

    /// Authenticates a Model Profile and keeps its model warm for later requests.
    pub fn prepare(
        &mut self,
        options: PrepareOptions,
    ) -> Result<EngineInformation, TranscriptionError> {
        let directory = PathBuf::from(options.model_directory);
        let digest = options.trusted_manifest_sha256.trim().to_ascii_lowercase();
        if digest.is_empty() {
            return Err(TranscriptionError::new(
                TranscriptionErrorCode::ModelUntrusted,
                "An authenticated Model Profile manifest digest is required.",
                false,
            ));
        }
        let canonical_directory = directory.canonicalize().ok();
        if canonical_directory.as_ref() == self.model_directory.as_ref()
            && self.trusted_manifest_sha256.as_deref() == Some(digest.as_str())
            && self.engine.is_prepared()
        {
            return Ok(EngineInformation {
                engine_version: engine_version().to_string(),
                model_id: self.model_id.clone().unwrap_or_default(),
                model_version: self.model_version.clone().unwrap_or_default(),
                load_ms: 0,
                reused: true,
            });
        }
        let profile = ModelProfile::load_trusted(&directory, &digest)?;
        let model_id = profile.model_id().to_string();
        let model_version = profile.model_version().to_string();
        let languages = profile.languages().to_vec();
        let model_directory = profile.directory().to_path_buf();
        let information = self.engine.prepare_validated_profile(&profile)?;
        let load_ms = milliseconds(information.load_ms);
        self.model_directory = Some(model_directory);
        self.trusted_manifest_sha256 = Some(digest);
        self.model_id = Some(model_id.clone());
        self.model_version = Some(model_version.clone());
        self.languages = languages;
        self.last_load_ms = Some(load_ms);
        Ok(EngineInformation {
            engine_version: engine_version().to_string(),
            model_id,
            model_version,
            load_ms,
            reused: information.reused,
        })
    }

    /// Transcribes a local audio file with the prepared warm model.
    pub fn transcribe(
        &mut self,
        input: AudioInput,
        options: TranscribeOptions,
    ) -> Result<Transcript, TranscriptionError> {
        let path = input.path.trim();
        if path.is_empty() {
            return Err(TranscriptionError::new(
                TranscriptionErrorCode::AudioInvalid,
                "A local audio file path is required.",
                true,
            ));
        }
        if !self.engine.is_prepared() {
            return Err(TranscriptionError::new(
                TranscriptionErrorCode::ModelNotPrepared,
                "The transcription model is not prepared.",
                true,
            ));
        }
        let language = options
            .language
            .as_deref()
            .unwrap_or("auto")
            .trim()
            .to_ascii_lowercase();
        if language != "auto" && !self.languages.iter().any(|item| item == &language) {
            return Err(TranscriptionError::new(
                TranscriptionErrorCode::LanguageUnsupported,
                "The prepared model does not support the selected language.",
                true,
            ));
        }
        let audio_path = resolve_allowed_audio_path(path, &self.allowed_audio_roots)?;
        let transcript = self.engine.transcribe_file(&audio_path)?;
        let inference_ms = milliseconds(transcript.inference_ms);
        self.last_inference_ms = Some(inference_ms);
        Ok(Transcript {
            text: transcript.text,
            outcome: match transcript.outcome {
                TranscriptOutcome::Speech => Outcome::Speech,
                TranscriptOutcome::NoSpeech => Outcome::NoSpeech,
            },
            inference_ms,
        })
    }

    /// Returns privacy-safe lifecycle and timing information.
    pub fn diagnostics(&self) -> Diagnostics {
        Diagnostics {
            state: if self.engine.is_prepared() {
                "ready"
            } else {
                "idle"
            },
            model_id: self.model_id.clone(),
            model_version: self.model_version.clone(),
            last_load_ms: self.last_load_ms,
            last_inference_ms: self.last_inference_ms,
        }
    }

    /// Releases the loaded model and resets the service to idle.
    pub fn dispose(&mut self) {
        *self = Self::new();
    }
}

fn milliseconds(value: u128) -> u64 {
    value.min(u64::MAX as u128) as u64
}

fn resolve_allowed_audio_path(
    path: impl AsRef<Path>,
    allowed_roots: &[PathBuf],
) -> Result<PathBuf, TranscriptionError> {
    let canonical = path.as_ref().canonicalize().map_err(|_| {
        TranscriptionError::new(
            TranscriptionErrorCode::AudioInvalid,
            "Audio file was not found.",
            true,
        )
    })?;
    let is_regular_file = canonical
        .metadata()
        .is_ok_and(|metadata| metadata.is_file());
    if !is_regular_file || !allowed_roots.iter().any(|root| canonical.starts_with(root)) {
        return Err(TranscriptionError::new(
            TranscriptionErrorCode::AudioInvalid,
            "Audio file is outside the host's allowed roots.",
            true,
        ));
    }
    Ok(canonical)
}

#[derive(Clone)]
struct ManagedState {
    service: Arc<Mutex<TranscriberService>>,
    diagnostics: Arc<RwLock<Diagnostics>>,
}

impl ManagedState {
    fn new(config: PluginConfig) -> Self {
        let service = TranscriberService::with_audio_roots(config.allowed_audio_roots);
        let diagnostics = service.diagnostics();
        Self {
            service: Arc::new(Mutex::new(service)),
            diagnostics: Arc::new(RwLock::new(diagnostics)),
        }
    }

    fn lock_service(&self) -> std::sync::MutexGuard<'_, TranscriberService> {
        match self.service.lock() {
            Ok(service) => service,
            Err(poisoned) => {
                let mut service = poisoned.into_inner();
                service.dispose();
                self.service.clear_poison();
                self.publish(service.diagnostics());
                service
            }
        }
    }

    fn publish(&self, diagnostics: Diagnostics) {
        match self.diagnostics.write() {
            Ok(mut snapshot) => *snapshot = diagnostics,
            Err(poisoned) => {
                *poisoned.into_inner() = diagnostics;
                self.diagnostics.clear_poison();
            }
        }
    }

    fn diagnostics(&self) -> Diagnostics {
        match self.diagnostics.read() {
            Ok(snapshot) => snapshot.clone(),
            Err(poisoned) => {
                let snapshot = poisoned.into_inner().clone();
                self.diagnostics.clear_poison();
                snapshot
            }
        }
    }
}

#[tauri::command]
async fn prepare(
    state: State<'_, ManagedState>,
    options: PrepareOptions,
) -> Result<EngineInformation, TranscriptionError> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut service = state.lock_service();
        let result = service.prepare(options);
        state.publish(service.diagnostics());
        result
    })
    .await
    .map_err(|_| {
        TranscriptionError::new(
            TranscriptionErrorCode::Internal,
            "The model preparation task did not complete.",
            true,
        )
    })?
}

#[tauri::command]
async fn transcribe(
    state: State<'_, ManagedState>,
    input: AudioInput,
    options: Option<TranscribeOptions>,
) -> Result<Transcript, TranscriptionError> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut service = state.lock_service();
        let result = service.transcribe(input, options.unwrap_or_default());
        state.publish(service.diagnostics());
        result
    })
    .await
    .map_err(|_| {
        TranscriptionError::new(
            TranscriptionErrorCode::Internal,
            "The transcription task did not complete.",
            true,
        )
    })?
}

#[tauri::command]
fn diagnostics(state: State<'_, ManagedState>) -> Diagnostics {
    state.diagnostics()
}

#[tauri::command]
async fn dispose(state: State<'_, ManagedState>) -> Result<(), TranscriptionError> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut service = state.lock_service();
        service.dispose();
        state.publish(service.diagnostics());
    })
    .await
    .map_err(|_| {
        TranscriptionError::new(
            TranscriptionErrorCode::Internal,
            "The disposal task did not complete.",
            true,
        )
    })?;
    Ok(())
}

/// Creates the Tauri 2 plugin with explicit host-owned audio roots.
///
/// Hosts must also grant command permissions. An empty configuration keeps
/// filesystem transcription denied.
pub fn init<R: Runtime>(config: PluginConfig) -> TauriPlugin<R> {
    Builder::new(PLUGIN_NAME)
        .invoke_handler(tauri::generate_handler![
            prepare,
            transcribe,
            diagnostics,
            dispose
        ])
        .setup(move |app, _api| {
            app.manage(ManagedState::new(config));
            Ok(())
        })
        .build()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::panic::{AssertUnwindSafe, catch_unwind};
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temporary_directory(name: &str) -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("the system clock must be after the Unix epoch")
            .as_nanos();
        let directory = std::env::temp_dir().join(format!("crunchymurmur-tauri-{name}-{unique}"));
        fs::create_dir_all(&directory).expect("the temporary directory should be created");
        directory
    }

    #[test]
    fn audio_paths_are_restricted_to_host_owned_roots() {
        let allowed = temporary_directory("allowed");
        let outside = temporary_directory("outside");
        let allowed_audio = allowed.join("message.wav");
        let outside_audio = outside.join("message.wav");
        fs::write(&allowed_audio, b"audio").expect("the allowed fixture should be written");
        fs::write(&outside_audio, b"audio").expect("the outside fixture should be written");
        let roots = vec![allowed.canonicalize().expect("the root should resolve")];

        assert_eq!(
            resolve_allowed_audio_path(&allowed_audio, &roots)
                .expect("the host-owned audio path should be accepted"),
            allowed_audio
                .canonicalize()
                .expect("the audio path should resolve")
        );
        let error = resolve_allowed_audio_path(&outside_audio, &roots)
            .expect_err("audio outside the configured roots must be rejected");
        assert_eq!(error.code(), TranscriptionErrorCode::AudioInvalid);

        fs::remove_dir_all(allowed).expect("the allowed fixture should be removed");
        fs::remove_dir_all(outside).expect("the outside fixture should be removed");
    }

    #[test]
    fn a_poisoned_service_recovers_to_idle() {
        let state = ManagedState::new(PluginConfig::new());
        let service = state.service.clone();
        let panic_result = catch_unwind(AssertUnwindSafe(move || {
            let _guard = service.lock().expect("the fresh mutex should lock");
            panic!("simulate an engine panic");
        }));
        assert!(panic_result.is_err());
        assert!(state.service.is_poisoned());

        drop(state.lock_service());

        assert!(!state.service.is_poisoned());
        assert_eq!(state.diagnostics().state, "idle");
    }
}
