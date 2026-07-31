use semver::Version;
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::error::Error;
use std::fmt;
use std::fs;
use std::io::Read;
use std::path::Component;
use std::path::{Path, PathBuf};
use std::time::Instant;
use transcribe_rs::onnx::Quantization;
use transcribe_rs::onnx::parakeet::ParakeetModel;
use transcribe_rs::{SpeechModel, TranscribeOptions};

// Model Profiles version the engine contract independently from the crate
// publication. The app's verified profiles already require contract 0.1.0,
// while the reusable crate is initially distributed as 0.1.0-alpha.1.
const ENGINE_VERSION: &str = "0.1.0";

/// Returns the semantic version of the shared native engine.
pub fn engine_version() -> &'static str {
    ENGINE_VERSION
}

/// Stable machine-readable failure categories exposed by the native engine.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EngineErrorCode {
    ModelNotFound,
    ModelInvalid,
    ModelUntrusted,
    ModelNotPrepared,
    AudioInvalid,
    InferenceFailed,
}

impl EngineErrorCode {
    /// Returns the cross-adapter string representation of this error code.
    pub fn as_str(self) -> &'static str {
        match self {
            Self::ModelNotFound => "MODEL_NOT_FOUND",
            Self::ModelInvalid => "MODEL_INVALID",
            Self::ModelUntrusted => "MODEL_UNTRUSTED",
            Self::ModelNotPrepared => "MODEL_NOT_PREPARED",
            Self::AudioInvalid => "AUDIO_INVALID",
            Self::InferenceFailed => "INFERENCE_FAILED",
        }
    }
}

/// A privacy-safe engine failure with a stable code and recovery hint.
#[derive(Debug)]
pub struct EngineError {
    code: EngineErrorCode,
    message: String,
    recoverable: bool,
}

impl EngineError {
    fn new(code: EngineErrorCode, message: impl Into<String>, recoverable: bool) -> Self {
        Self {
            code,
            message: message.into(),
            recoverable,
        }
    }

    /// Returns the stable category applications should branch on.
    pub fn code(&self) -> EngineErrorCode {
        self.code
    }

    /// Reports whether retrying after user or host action may succeed.
    pub fn recoverable(&self) -> bool {
        self.recoverable
    }
}

impl fmt::Display for EngineError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl Error for EngineError {}

/// Model preparation timing and cache reuse information.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EngineInfo {
    /// Semantic version of the loaded on-device engine.
    pub engine_version: &'static str,
    /// Stable model identifier when preparation used a Model Profile.
    pub model_id: Option<String>,
    /// Semantic model version when preparation used a Model Profile.
    pub model_version: Option<String>,
    /// Time spent loading the model, in milliseconds.
    pub load_ms: u128,
    /// Whether an already prepared model instance was reused.
    pub reused: bool,
}

/// Successful transcription classification.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TranscriptOutcome {
    Speech,
    NoSpeech,
}

/// A successful final transcription result.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Transcript {
    /// Normalised transcript text, empty for a no-speech outcome.
    pub text: String,
    /// Whether usable speech was detected.
    pub outcome: TranscriptOutcome,
    /// Time spent running inference, in milliseconds.
    pub inference_ms: u128,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ModelFile {
    path: String,
    bytes: u64,
    sha256: String,
}

/// A validated description of the files and compatibility of a local model.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelProfile {
    schema_version: u32,
    model_id: String,
    model_version: String,
    engine: String,
    quantisation: String,
    languages: Vec<String>,
    files: Vec<ModelFile>,
    minimum_engine_version: String,
    #[serde(skip)]
    directory: PathBuf,
}

impl ModelProfile {
    /// Loads and validates a profile without applying a host trust policy.
    pub fn load(directory: &Path) -> Result<Self, EngineError> {
        Self::load_with_trust(directory, None)
    }

    /// Loads a profile whose manifest must match a host-authenticated digest.
    pub fn load_trusted(
        directory: &Path,
        trusted_manifest_sha256: &str,
    ) -> Result<Self, EngineError> {
        Self::load_with_trust(directory, Some(trusted_manifest_sha256))
    }

    fn load_with_trust(
        directory: &Path,
        trusted_manifest_sha256: Option<&str>,
    ) -> Result<Self, EngineError> {
        let root = directory.canonicalize().map_err(|_| {
            EngineError::new(
                EngineErrorCode::ModelNotFound,
                "Model Profile directory was not found.",
                true,
            )
        })?;
        let manifest_path = root.join("crunchymurmur-model.json");
        let manifest = fs::read(&manifest_path).map_err(|_| {
            EngineError::new(
                EngineErrorCode::ModelNotFound,
                "Model Profile manifest was not found.",
                true,
            )
        })?;
        if let Some(expected) = trusted_manifest_sha256 {
            let actual = format!("{:x}", Sha256::digest(&manifest));
            if !actual.eq_ignore_ascii_case(expected.trim()) {
                return Err(EngineError::new(
                    EngineErrorCode::ModelUntrusted,
                    "Model Profile manifest is not trusted by this host.",
                    false,
                ));
            }
        }
        let mut profile: Self = serde_json::from_slice(&manifest).map_err(|_| {
            EngineError::new(
                EngineErrorCode::ModelInvalid,
                "Model Profile manifest is not valid JSON.",
                true,
            )
        })?;
        profile.directory = root;
        profile.validate()?;
        Ok(profile)
    }

    fn validate(&self) -> Result<(), EngineError> {
        let model_version = Version::parse(&self.model_version);
        let minimum_engine_version = Version::parse(&self.minimum_engine_version);
        if self.schema_version != 1
            || self.model_id.trim().is_empty()
            || model_version.is_err()
            || self.engine != "parakeet"
            || self.quantisation != "int8"
            || self.languages.is_empty()
            || minimum_engine_version.is_err()
            || self.files.is_empty()
        {
            return Err(EngineError::new(
                EngineErrorCode::ModelInvalid,
                "Model Profile manifest contains unsupported or missing values.",
                true,
            ));
        }
        if minimum_engine_version.expect("validated semantic version")
            > Version::parse(ENGINE_VERSION).expect("package version is semantic")
        {
            return Err(EngineError::new(
                EngineErrorCode::ModelInvalid,
                "Model Profile requires a newer transcription engine.",
                true,
            ));
        }

        for model_file in &self.files {
            let relative = Path::new(&model_file.path);
            if relative.as_os_str().is_empty()
                || relative
                    .components()
                    .any(|part| !matches!(part, Component::Normal(_)))
            {
                return Err(EngineError::new(
                    EngineErrorCode::ModelInvalid,
                    "Model Profile contains an unsafe file path.",
                    true,
                ));
            }
            let path = self.directory.join(relative);
            let canonical = path.canonicalize().map_err(|_| {
                EngineError::new(
                    EngineErrorCode::ModelInvalid,
                    "Model Profile file was not found.",
                    true,
                )
            })?;
            if !canonical.starts_with(&self.directory) {
                return Err(EngineError::new(
                    EngineErrorCode::ModelInvalid,
                    "Model Profile file resolves outside its directory.",
                    true,
                ));
            }
            let metadata = canonical.metadata().map_err(|_| {
                EngineError::new(
                    EngineErrorCode::ModelInvalid,
                    "Model Profile file metadata could not be read.",
                    true,
                )
            })?;
            if !metadata.is_file() || metadata.len() != model_file.bytes {
                return Err(EngineError::new(
                    EngineErrorCode::ModelInvalid,
                    "Model Profile file size does not match its manifest.",
                    true,
                ));
            }

            let mut file = fs::File::open(&canonical).map_err(|_| {
                EngineError::new(
                    EngineErrorCode::ModelInvalid,
                    "Model Profile file could not be opened.",
                    true,
                )
            })?;
            let mut hasher = Sha256::new();
            let mut buffer = [0_u8; 64 * 1024];
            loop {
                let count = file.read(&mut buffer).map_err(|_| {
                    EngineError::new(
                        EngineErrorCode::ModelInvalid,
                        "Model Profile file could not be verified.",
                        true,
                    )
                })?;
                if count == 0 {
                    break;
                }
                hasher.update(&buffer[..count]);
            }
            let actual = format!("{:x}", hasher.finalize());
            if !actual.eq_ignore_ascii_case(model_file.sha256.trim()) {
                return Err(EngineError::new(
                    EngineErrorCode::ModelInvalid,
                    "Model Profile file checksum does not match its manifest.",
                    true,
                ));
            }
        }
        Ok(())
    }

    /// Returns the stable model identifier declared by the profile.
    pub fn model_id(&self) -> &str {
        &self.model_id
    }

    /// Returns the semantic model version declared by the profile.
    pub fn model_version(&self) -> &str {
        &self.model_version
    }

    /// Returns the canonical directory containing the validated model files.
    pub fn directory(&self) -> &Path {
        &self.directory
    }

    /// Returns the spoken-language identifiers supported by this model.
    pub fn languages(&self) -> &[String] {
        &self.languages
    }
}

/// Stateful on-device engine that keeps one Parakeet model warm for reuse.
pub struct OnDeviceEngine {
    parakeet: Option<ParakeetModel>,
    model_path: Option<PathBuf>,
    trusted_manifest_sha256: Option<String>,
    model_id: Option<String>,
    model_version: Option<String>,
    last_load_ms: Option<u128>,
}

impl Default for OnDeviceEngine {
    fn default() -> Self {
        Self::new()
    }
}

impl OnDeviceEngine {
    /// Creates an unloaded engine without accessing the filesystem.
    pub fn new() -> Self {
        Self {
            parakeet: None,
            model_path: None,
            trusted_manifest_sha256: None,
            model_id: None,
            model_version: None,
            last_load_ms: None,
        }
    }

    /// Loads a raw Parakeet model directory for trusted first-party hosts.
    pub fn prepare(&mut self, model_path: &Path) -> Result<EngineInfo, EngineError> {
        if self.model_path.as_deref() == Some(model_path) && self.parakeet.is_some() {
            return Ok(EngineInfo {
                engine_version: ENGINE_VERSION,
                model_id: self.model_id.clone(),
                model_version: self.model_version.clone(),
                load_ms: 0,
                reused: true,
            });
        }
        if !model_path.is_dir() {
            return Err(EngineError::new(
                EngineErrorCode::ModelNotFound,
                "Parakeet model directory was not found.",
                true,
            ));
        }

        let started = Instant::now();
        let model = ParakeetModel::load(model_path, &Quantization::Int8).map_err(|error| {
            EngineError::new(
                EngineErrorCode::ModelInvalid,
                format!("Parakeet model could not be loaded: {error}"),
                true,
            )
        })?;
        let load_ms = started.elapsed().as_millis();
        self.parakeet = Some(model);
        self.model_path = Some(model_path.to_path_buf());
        self.trusted_manifest_sha256 = None;
        self.model_id = None;
        self.model_version = None;
        self.last_load_ms = Some(load_ms);
        Ok(EngineInfo {
            engine_version: ENGINE_VERSION,
            model_id: None,
            model_version: None,
            load_ms,
            reused: false,
        })
    }

    /// Validates a Model Profile and prepares its model files.
    pub fn prepare_profile(&mut self, model_directory: &Path) -> Result<EngineInfo, EngineError> {
        let profile = ModelProfile::load(model_directory)?;
        self.prepare_validated_profile(&profile)
    }

    /// Prepares a model from a profile that has already been validated.
    ///
    /// This uses [`Self::prepare`], which clears the engine's stored trust
    /// digest. Callers implementing a trusted preparation flow must restore
    /// their authenticated digest only after this method succeeds.
    pub fn prepare_validated_profile(
        &mut self,
        profile: &ModelProfile,
    ) -> Result<EngineInfo, EngineError> {
        let mut information = self.prepare(profile.directory())?;
        self.model_id = Some(profile.model_id().to_string());
        self.model_version = Some(profile.model_version().to_string());
        information.model_id = self.model_id.clone();
        information.model_version = self.model_version.clone();
        Ok(information)
    }

    /// Validates an authenticated Model Profile and prepares its model files.
    pub fn prepare_trusted_profile(
        &mut self,
        model_directory: &Path,
        trusted_manifest_sha256: &str,
    ) -> Result<EngineInfo, EngineError> {
        let trusted_digest = trusted_manifest_sha256.trim().to_ascii_lowercase();
        let canonical_directory = model_directory.canonicalize().ok();
        if canonical_directory.as_deref() == self.model_path.as_deref()
            && self.parakeet.is_some()
            && self.trusted_manifest_sha256.as_deref() == Some(trusted_digest.as_str())
        {
            return Ok(EngineInfo {
                engine_version: ENGINE_VERSION,
                model_id: self.model_id.clone(),
                model_version: self.model_version.clone(),
                load_ms: 0,
                reused: true,
            });
        }
        let profile = ModelProfile::load_trusted(model_directory, trusted_manifest_sha256)?;
        let info = self.prepare_validated_profile(&profile)?;
        self.trusted_manifest_sha256 = Some(trusted_digest);
        Ok(info)
    }

    /// Transcribes a local audio file with the prepared model.
    pub fn transcribe_file(&mut self, audio_path: &Path) -> Result<Transcript, EngineError> {
        if !audio_path.is_file() {
            return Err(EngineError::new(
                EngineErrorCode::AudioInvalid,
                "Audio file was not found.",
                true,
            ));
        }
        let model = self.parakeet.as_mut().ok_or_else(|| {
            EngineError::new(
                EngineErrorCode::ModelNotPrepared,
                "The transcription model is not prepared.",
                true,
            )
        })?;
        let started = Instant::now();
        let result = model
            .transcribe_file(audio_path, &TranscribeOptions::default())
            .map_err(|error| {
                EngineError::new(
                    EngineErrorCode::InferenceFailed,
                    format!("Local transcription failed: {error}"),
                    true,
                )
            })?;
        let text = result.text.trim().to_string();
        Ok(Transcript {
            outcome: if text.is_empty() {
                TranscriptOutcome::NoSpeech
            } else {
                TranscriptOutcome::Speech
            },
            text,
            inference_ms: started.elapsed().as_millis(),
        })
    }

    /// Reports whether a model is currently loaded.
    pub fn is_prepared(&self) -> bool {
        self.parakeet.is_some()
    }

    /// Returns the duration of the latest successful model load.
    pub fn last_load_ms(&self) -> Option<u128> {
        self.last_load_ms
    }
}
