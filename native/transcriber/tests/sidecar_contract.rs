use crunchymurmur_transcriber::engine_version;
use serde_json::Value;
use std::io::Write;
use std::process::{Command, Stdio};

#[test]
fn sidecar_status_reports_the_public_engine_version() {
    let mut child = Command::new(env!("CARGO_BIN_EXE_crunchymurmur-transcriber"))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .expect("the sidecar binary should start");
    let mut stdin = child.stdin.take().expect("sidecar stdin");
    writeln!(stdin, "{}", serde_json::json!({ "action": "status" })).unwrap();
    writeln!(stdin, "{}", serde_json::json!({ "action": "shutdown" })).unwrap();
    drop(stdin);

    let output = child.wait_with_output().expect("sidecar output");
    assert!(output.status.success());
    let first: serde_json::Value = serde_json::from_str(
        String::from_utf8(output.stdout)
            .unwrap()
            .lines()
            .next()
            .expect("status response"),
    )
    .unwrap();

    assert_eq!(first["ok"], true);
    assert_eq!(first["engineVersion"], engine_version());
}

#[test]
fn sidecar_maps_engine_failures_to_stable_error_codes() {
    let mut child = Command::new(env!("CARGO_BIN_EXE_crunchymurmur-transcriber"))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .expect("the sidecar binary should start");

    let mut stdin = child.stdin.take().expect("sidecar stdin");
    writeln!(
        stdin,
        "{}",
        serde_json::json!({
            "action": "load",
            "modelPath": "missing-model-profile"
        })
    )
    .unwrap();
    writeln!(stdin, "{}", serde_json::json!({ "action": "shutdown" })).unwrap();
    drop(stdin);

    let output = child.wait_with_output().expect("sidecar output");
    assert!(output.status.success());
    let first_line = String::from_utf8(output.stdout)
        .unwrap()
        .lines()
        .next()
        .unwrap()
        .to_string();
    let response: Value = serde_json::from_str(&first_line).unwrap();

    assert_eq!(response["ok"], false);
    assert_eq!(response["errorCode"], "MODEL_NOT_FOUND");
    assert_eq!(response["recoverable"], true);
    assert!(response["error"].as_str().unwrap().contains("not found"));
}
