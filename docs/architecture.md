# Architecture

CrunchyMurmur is an Electron tray application with two local renderers.

- `src/main.js` owns windows, IPC, app lifecycle, privileged filesystem work,
  transcription, and authoritative recording state.
- `ui/main.*` provides settings, history, notes, calendar, and meeting UI. It
  captures meeting audio and immediately sends bounded 16 kHz chunks to main.
- `ui/floating.*` owns short push-to-talk capture and never receives secrets.
- `src/*-store.js` modules persist user data. App-owned JSON writes use
  same-directory temporary files followed by atomic rename.
- `src/preload-*.js` exposes narrow, named capabilities through contextBridge.

## Trust boundaries

Renderers use context isolation, have no Node integration, and load local
content under a restrictive CSP. Main checks the sending `webContents` for
every IPC call. Renderer-supplied path components must pass root-containment
checks before filesystem use. External HTTPS links are allowlisted and opened
by the operating system, never loaded into an app window.

API keys are decrypted only in main. Renderer settings snapshots contain a
fixed mask instead of secret values. CLI AI providers run without tools from a
new temporary directory, limiting transcript prompt-injection impact.

## Audio lifecycle

Short dictation is capped at ten minutes, encoded to a unique temporary WAV,
transcribed, and deleted in `finally`. Meetings are streamed to a partial WAV
in main. Finalization patches the header and renames the file. A partial file
left by a crash is recovered on the next meeting-list load.

## Local transcription lifecycle

Local transcription has two process boundaries shared by dictation and meeting
chunks. `src/native-transcription-service.js` keeps the bundled Rust
`transcribe-rs` helper and Parakeet model alive across requests.
`src/local-transcription-service.js` manages Whisper. Packaged releases include
a whisper.cpp runtime prepared from a pinned upstream commit with verified
source artifacts. Main starts `whisper-server` on an unused loopback port,
loads the selected model once, and reuses it for subsequent requests.
The server binds only to `127.0.0.1`, receives WAV data over a private local
request, and is stopped after 15 idle minutes or when the app quits.

Recording starts the model preload before the completed clip is submitted. A
model or executable change disposes the old process before loading the new one.
If the persistent server exits or fails health checks, the same service falls
back to the configured one-shot `whisper-cli` process, so local transcription
remains available. A user-selected executable overrides the bundled runtime;
otherwise the packaged executable is used.
Backend, model-load, inference, and fallback information is included in masked
diagnostics and app logs.

Before either local or cloud inference, `src/audio-quality.js` rejects clips
that are too short or effectively silent.

## Reusable on-device engine

The [On-device Transcription SDK](on-device-sdk.md) exposes the Rust
transcription implementation as a reusable library while retaining the existing
helper as an isolated Node/Electron adapter. The in-repository Tauri 2 plugin
links that same crate directly and places model preparation, transcription,
diagnostics, and disposal behind explicit Tauri command permissions. Swift,
Kotlin, and React Native adapters follow only after the shared engine contract
and mobile model profiles pass conformance, memory, and performance testing.

Microphone capture remains owned by each host platform. The reusable engine
accepts local audio, manages model and inference lifecycle, and produces stable
transcript outcomes without networking or telemetry.
