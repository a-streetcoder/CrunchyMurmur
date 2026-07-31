use crunchymurmur_transcriber::{
    EngineError, EngineInfo, OnDeviceEngine, TranscriptOutcome, engine_version,
};
use serde::{Deserialize, Serialize};
use std::io::{self, BufRead, Write};
use std::path::{Path, PathBuf};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Request {
    action: String,
    #[serde(default)]
    model_path: String,
    #[serde(default)]
    audio_path: String,
    #[serde(default)]
    require_profile: bool,
    #[serde(default)]
    trusted_manifest_sha256: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct Response {
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    outcome: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error_code: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    recoverable: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    model_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    engine_version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    model_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    model_version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    reused: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    load_ms: Option<u128>,
    #[serde(skip_serializing_if = "Option::is_none")]
    inference_ms: Option<u128>,
}

impl Response {
    fn success() -> Self {
        Self {
            ok: true,
            text: None,
            outcome: None,
            error: None,
            error_code: None,
            recoverable: None,
            model_path: None,
            engine_version: Some(engine_version().to_string()),
            model_id: None,
            model_version: None,
            reused: None,
            load_ms: None,
            inference_ms: None,
        }
    }

    fn failure(error: &EngineError) -> Self {
        Self {
            ok: false,
            error: Some(error.to_string()),
            error_code: Some(error.code().as_str().to_string()),
            recoverable: Some(error.recoverable()),
            ..Self::success()
        }
    }

    fn protocol_failure(code: &str, error: impl ToString) -> Self {
        Self {
            ok: false,
            error: Some(error.to_string()),
            error_code: Some(code.to_string()),
            recoverable: Some(false),
            ..Self::success()
        }
    }
}

struct Runtime {
    engine: OnDeviceEngine,
    model_path: Option<PathBuf>,
}

impl Runtime {
    fn new() -> Self {
        Self {
            engine: OnDeviceEngine::new(),
            model_path: None,
        }
    }

    fn prepare_for(&mut self, path: &Path, request: &Request) -> Result<EngineInfo, EngineError> {
        if !request.trusted_manifest_sha256.is_empty() {
            self.engine
                .prepare_trusted_profile(path, &request.trusted_manifest_sha256)
        } else if request.require_profile {
            self.engine.prepare_profile(path)
        } else {
            self.engine.prepare(path)
        }
    }

    fn handle(&mut self, request: Request) -> Response {
        match request.action.as_str() {
            "status" => {
                let mut response = Response::success();
                response.model_path = self
                    .model_path
                    .as_ref()
                    .map(|path| path.to_string_lossy().into_owned());
                response.load_ms = self.engine.last_load_ms();
                response
            }
            "load" => {
                let path = PathBuf::from(&request.model_path);
                let result = self.prepare_for(&path, &request);
                match result {
                    Ok(info) => {
                        self.model_path = Some(path.clone());
                        let mut response = Response::success();
                        response.model_path = Some(path.to_string_lossy().into_owned());
                        response.model_id = info.model_id;
                        response.model_version = info.model_version;
                        response.reused = Some(info.reused);
                        response.load_ms = Some(info.load_ms);
                        response
                    }
                    Err(error) => Response::failure(&error),
                }
            }
            "transcribe" => {
                let model_path = PathBuf::from(&request.model_path);
                let audio_path = PathBuf::from(&request.audio_path);
                let prepared = self.prepare_for(&model_path, &request);
                if let Err(error) = prepared {
                    return Response::failure(&error);
                }
                self.model_path = Some(model_path.clone());
                match self.engine.transcribe_file(&audio_path) {
                    Ok(transcript) => {
                        let mut response = Response::success();
                        response.text = Some(transcript.text);
                        response.outcome = Some(
                            match transcript.outcome {
                                TranscriptOutcome::Speech => "speech",
                                TranscriptOutcome::NoSpeech => "no-speech",
                            }
                            .to_string(),
                        );
                        response.model_path = Some(model_path.to_string_lossy().into_owned());
                        response.inference_ms = Some(transcript.inference_ms);
                        response
                    }
                    Err(error) => Response::failure(&error),
                }
            }
            "shutdown" => Response::success(),
            action => {
                Response::protocol_failure("INVALID_REQUEST", format!("Unknown action: {action}"))
            }
        }
    }
}

fn write_response(response: &Response) -> io::Result<()> {
    let stdout = io::stdout();
    let mut output = stdout.lock();
    serde_json::to_writer(&mut output, response)?;
    output.write_all(b"\n")?;
    output.flush()
}

fn main() -> io::Result<()> {
    let stdin = io::stdin();
    let mut runtime = Runtime::new();

    for line in stdin.lock().lines() {
        let line = line?;
        if line.trim().is_empty() {
            continue;
        }
        let request = match serde_json::from_str::<Request>(&line) {
            Ok(request) => request,
            Err(error) => {
                write_response(&Response::protocol_failure(
                    "INVALID_REQUEST",
                    format!("Invalid request: {error}"),
                ))?;
                continue;
            }
        };
        let should_stop = request.action == "shutdown";
        write_response(&runtime.handle(request))?;
        if should_stop {
            break;
        }
    }
    Ok(())
}
