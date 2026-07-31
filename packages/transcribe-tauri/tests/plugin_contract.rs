use std::time::{SystemTime, UNIX_EPOCH};
use tauri_plugin_crunchymurmur_transcribe::{
    AudioInput, PrepareOptions, TranscribeOptions, TranscriberService, TranscriptionErrorCode,
};

fn guaranteed_missing_path(name: &str) -> String {
    let unique = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("the system clock must be after the Unix epoch")
        .as_nanos();
    std::env::temp_dir()
        .join(format!(
            "crunchymurmur-{name}-{}-{unique}",
            std::process::id()
        ))
        .to_string_lossy()
        .into_owned()
}

#[test]
fn missing_profiles_map_to_the_shared_stable_error_contract() {
    let mut service = TranscriberService::new();
    let error = service
        .prepare(PrepareOptions {
            model_directory: guaranteed_missing_path("missing-profile"),
            trusted_manifest_sha256: "0".repeat(64),
        })
        .expect_err("a missing model profile must fail");

    assert_eq!(error.code(), TranscriptionErrorCode::ModelNotFound);
    assert!(error.recoverable());
}

#[test]
fn diagnostics_start_idle_without_exposing_a_filesystem_path() {
    let service = TranscriberService::new();
    let diagnostics = service.diagnostics();

    assert_eq!(diagnostics.state, "idle");
    assert!(diagnostics.model_id.is_none());
    assert!(diagnostics.model_version.is_none());
    assert!(diagnostics.last_load_ms.is_none());
    assert!(diagnostics.last_inference_ms.is_none());
}

#[test]
fn preparation_requires_an_authenticated_manifest_digest() {
    let mut service = TranscriberService::new();
    let error = service
        .prepare(PrepareOptions {
            model_directory: "model-profile".into(),
            trusted_manifest_sha256: String::new(),
        })
        .expect_err("an untrusted profile must not reach model loading");

    assert_eq!(error.code(), TranscriptionErrorCode::ModelUntrusted);
    assert!(!error.recoverable());
}

#[test]
fn malformed_audio_is_rejected_before_engine_readiness() {
    let mut service = TranscriberService::new();

    for path in ["", "   "] {
        let error = service
            .transcribe(
                AudioInput { path: path.into() },
                TranscribeOptions::default(),
            )
            .expect_err("an empty audio path must be rejected");

        assert_eq!(error.code(), TranscriptionErrorCode::AudioInvalid);
    }
}

#[test]
fn a_valid_path_requires_a_prepared_model_before_language_validation() {
    let mut service = TranscriberService::new();
    let error = service
        .transcribe(
            AudioInput {
                path: guaranteed_missing_path("audio.wav"),
            },
            TranscribeOptions {
                language: Some("unsupported".into()),
            },
        )
        .expect_err("transcription must require model preparation");

    assert_eq!(error.code(), TranscriptionErrorCode::ModelNotPrepared);
}

#[test]
fn dispose_resets_all_public_diagnostics() {
    let mut service = TranscriberService::new();
    service.dispose();
    let diagnostics = service.diagnostics();

    assert_eq!(diagnostics.state, "idle");
    assert!(diagnostics.model_id.is_none());
    assert!(diagnostics.model_version.is_none());
    assert!(diagnostics.last_load_ms.is_none());
    assert!(diagnostics.last_inference_ms.is_none());
}
