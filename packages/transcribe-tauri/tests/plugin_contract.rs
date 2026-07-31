use tauri_plugin_crunchymurmur_transcribe::{
    PrepareOptions, TranscriberService, TranscriptionErrorCode,
};

#[test]
fn missing_profiles_map_to_the_shared_stable_error_contract() {
    let mut service = TranscriberService::new();
    let error = service
        .prepare(PrepareOptions {
            model_directory: "missing-model-profile".into(),
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
