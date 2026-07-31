//! Tauri 2 desktop adapter for CrunchyMurmur's on-device transcription engine.

use crunchymurmur_transcriber::{
    EngineError, EngineErrorCode, ModelProfile, OnDeviceEngine, TranscriptOutcome, engine_version,
};
use serde::{Deserialize, Serialize};
use std::fmt;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
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
#[derive(Debug, Serialize)]
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

/// Direct Rust service used by the Tauri command adapter.
pub struct TranscriberService {
    engine: OnDeviceEngine,
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
        Self {
            engine: OnDeviceEngine::new(),
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
        let transcript = self.engine.transcribe_file(&PathBuf::from(path))?;
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

#[derive(Clone, Default)]
struct ManagedState(Arc<Mutex<TranscriberService>>);

fn lock_service(
    state: &ManagedState,
) -> Result<std::sync::MutexGuard<'_, TranscriberService>, TranscriptionError> {
    state.0.lock().map_err(|_| {
        TranscriptionError::new(
            TranscriptionErrorCode::Internal,
            "The transcription service state is unavailable.",
            true,
        )
    })
}

#[tauri::command]
async fn prepare(
    state: State<'_, ManagedState>,
    options: PrepareOptions,
) -> Result<EngineInformation, TranscriptionError> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || lock_service(&state)?.prepare(options))
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
        lock_service(&state)?.transcribe(input, options.unwrap_or_default())
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
async fn diagnostics(state: State<'_, ManagedState>) -> Result<Diagnostics, TranscriptionError> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || Ok(lock_service(&state)?.diagnostics()))
        .await
        .map_err(|_| {
            TranscriptionError::new(
                TranscriptionErrorCode::Internal,
                "The diagnostics task did not complete.",
                true,
            )
        })?
}

#[tauri::command]
async fn dispose(state: State<'_, ManagedState>) -> Result<(), TranscriptionError> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        lock_service(&state)?.dispose();
        Ok(())
    })
    .await
    .map_err(|_| {
        TranscriptionError::new(
            TranscriptionErrorCode::Internal,
            "The disposal task did not complete.",
            true,
        )
    })?
}

/// Creates the Tauri 2 plugin. Hosts must explicitly grant command permissions.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new(PLUGIN_NAME)
        .invoke_handler(tauri::generate_handler![
            prepare,
            transcribe,
            diagnostics,
            dispose
        ])
        .setup(|app, _api| {
            app.manage(ManagedState::default());
            Ok(())
        })
        .build()
}
