use crunchymurmur_transcriber::{EngineErrorCode, ModelProfile, OnDeviceEngine};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

fn temporary_directory(name: &str) -> PathBuf {
    let unique = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let directory = std::env::temp_dir().join(format!("crunchymurmur-{name}-{unique}"));
    fs::create_dir_all(&directory).unwrap();
    directory
}

#[test]
fn missing_model_is_reported_through_the_public_engine_contract() {
    let mut engine = OnDeviceEngine::new();
    let error = engine
        .prepare(Path::new("missing-model-profile"))
        .expect_err("a missing model must not prepare successfully");

    assert_eq!(error.code(), EngineErrorCode::ModelNotFound);
    assert!(error.recoverable());
    assert!(
        !error
            .to_string()
            .contains(std::env::current_dir().unwrap().to_string_lossy().as_ref())
    );
}

#[test]
fn model_profile_verifies_local_assets_before_the_engine_uses_them() {
    let directory = temporary_directory("model-profile");
    fs::write(directory.join("model.onnx"), b"model").unwrap();
    fs::write(
        directory.join("crunchymurmur-model.json"),
        r#"{
            "schemaVersion": 1,
            "modelId": "parakeet-v3-int8",
            "modelVersion": "1.0.0",
            "engine": "parakeet",
            "quantisation": "int8",
            "languages": ["auto", "en"],
            "files": [{
                "path": "model.onnx",
                "bytes": 5,
                "sha256": "9372c470eeadd5ecd9c3c74c2b3cb633f8e2f2fad799250a0f70d652b6b825e4"
            }],
            "minimumEngineVersion": "0.1.0"
        }"#,
    )
    .unwrap();

    let profile = ModelProfile::load(&directory).expect("a complete profile should validate");

    assert_eq!(profile.model_id(), "parakeet-v3-int8");
    assert_eq!(profile.model_version(), "1.0.0");
    assert_eq!(profile.directory(), directory.canonicalize().unwrap());
    fs::remove_dir_all(profile.directory()).unwrap();
}

#[test]
fn sdk_preparation_requires_a_model_profile_manifest() {
    let directory = temporary_directory("missing-profile");
    let mut engine = OnDeviceEngine::new();

    let error = engine
        .prepare_profile(&directory)
        .expect_err("SDK preparation must reject an unmanaged model directory");

    assert_eq!(error.code(), EngineErrorCode::ModelNotFound);
    assert!(error.recoverable());
    fs::remove_dir_all(directory).unwrap();
}

#[test]
fn model_profiles_cannot_require_a_newer_engine() {
    let directory = temporary_directory("future-engine");
    fs::write(directory.join("model.onnx"), b"model").unwrap();
    fs::write(
        directory.join("crunchymurmur-model.json"),
        r#"{
            "schemaVersion": 1,
            "modelId": "future-model",
            "modelVersion": "1.0.0",
            "engine": "parakeet",
            "quantisation": "int8",
            "languages": ["auto", "en"],
            "files": [{
                "path": "model.onnx",
                "bytes": 5,
                "sha256": "9372c470eeadd5ecd9c3c74c2b3cb633f8e2f2fad799250a0f70d652b6b825e4"
            }],
            "minimumEngineVersion": "99.0.0"
        }"#,
    )
    .unwrap();

    let error =
        ModelProfile::load(&directory).expect_err("a future engine requirement must be rejected");

    assert_eq!(error.code(), EngineErrorCode::ModelInvalid);
    assert!(error.to_string().contains("newer"));
    fs::remove_dir_all(directory).unwrap();
}

#[test]
fn trusted_model_profiles_reject_an_unpinned_manifest() {
    let directory = temporary_directory("untrusted-profile");
    fs::write(directory.join("model.onnx"), b"model").unwrap();
    fs::write(
        directory.join("crunchymurmur-model.json"),
        r#"{
            "schemaVersion": 1,
            "modelId": "parakeet-v3-int8",
            "modelVersion": "1.0.0",
            "engine": "parakeet",
            "quantisation": "int8",
            "languages": ["auto", "en"],
            "files": [{
                "path": "model.onnx",
                "bytes": 5,
                "sha256": "9372c470eeadd5ecd9c3c74c2b3cb633f8e2f2fad799250a0f70d652b6b825e4"
            }],
            "minimumEngineVersion": "0.1.0"
        }"#,
    )
    .unwrap();

    let error = ModelProfile::load_trusted(&directory, &"0".repeat(64))
        .expect_err("a manifest outside the trusted release index must be rejected");

    assert_eq!(error.code(), EngineErrorCode::ModelUntrusted);
    assert!(!error.recoverable());
    fs::remove_dir_all(directory).unwrap();
}
