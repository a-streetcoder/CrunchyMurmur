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

const ENGINE_VERSION: &str = env!("CARGO_PKG_VERSION");

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

    pub fn code(&self) -> EngineErrorCode {
        self.code
    }

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

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct EngineInfo {
    pub load_ms: u128,
    pub reused: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TranscriptOutcome {
    Speech,
    NoSpeech,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Transcript {
    pub text: String,
    pub outcome: TranscriptOutcome,
    pub inference_ms: u128,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ModelFile {
    path: String,
    bytes: u64,
    sha256: String,
}

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
    pub fn load(directory: &Path) -> Result<Self, EngineError> {
        Self::load_with_trust(directory, None)
    }

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

    pub fn model_id(&self) -> &str {
        &self.model_id
    }

    pub fn model_version(&self) -> &str {
        &self.model_version
    }

    pub fn directory(&self) -> &Path {
        &self.directory
    }
}

pub struct OnDeviceEngine {
    parakeet: Option<ParakeetModel>,
    model_path: Option<PathBuf>,
    trusted_manifest_sha256: Option<String>,
    last_load_ms: Option<u128>,
}

impl Default for OnDeviceEngine {
    fn default() -> Self {
        Self::new()
    }
}

impl OnDeviceEngine {
    pub fn new() -> Self {
        Self {
            parakeet: None,
            model_path: None,
            trusted_manifest_sha256: None,
            last_load_ms: None,
        }
    }

    pub fn prepare(&mut self, model_path: &Path) -> Result<EngineInfo, EngineError> {
        if self.model_path.as_deref() == Some(model_path) && self.parakeet.is_some() {
            return Ok(EngineInfo {
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
        let model = ParakeetModel::load(&model_path.to_path_buf(), &Quantization::Int8).map_err(
            |error| {
                EngineError::new(
                    EngineErrorCode::ModelInvalid,
                    format!("Parakeet model could not be loaded: {error}"),
                    true,
                )
            },
        )?;
        let load_ms = started.elapsed().as_millis();
        self.parakeet = Some(model);
        self.model_path = Some(model_path.to_path_buf());
        self.trusted_manifest_sha256 = None;
        self.last_load_ms = Some(load_ms);
        Ok(EngineInfo {
            load_ms,
            reused: false,
        })
    }

    pub fn prepare_profile(&mut self, model_directory: &Path) -> Result<EngineInfo, EngineError> {
        if self.model_path.as_deref() == Some(model_directory) && self.parakeet.is_some() {
            return Ok(EngineInfo {
                load_ms: 0,
                reused: true,
            });
        }
        ModelProfile::load(model_directory)?;
        self.prepare(model_directory)
    }

    pub fn prepare_trusted_profile(
        &mut self,
        model_directory: &Path,
        trusted_manifest_sha256: &str,
    ) -> Result<EngineInfo, EngineError> {
        let trusted_digest = trusted_manifest_sha256.trim().to_ascii_lowercase();
        if self.model_path.as_deref() == Some(model_directory)
            && self.parakeet.is_some()
            && self.trusted_manifest_sha256.as_deref() == Some(trusted_digest.as_str())
        {
            return Ok(EngineInfo {
                load_ms: 0,
                reused: true,
            });
        }
        ModelProfile::load_trusted(model_directory, trusted_manifest_sha256)?;
        let info = self.prepare(model_directory)?;
        self.trusted_manifest_sha256 = Some(trusted_digest);
        Ok(info)
    }

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

    pub fn is_prepared(&self) -> bool {
        self.parakeet.is_some()
    }

    pub fn last_load_ms(&self) -> Option<u128> {
        self.last_load_ms
    }
}
