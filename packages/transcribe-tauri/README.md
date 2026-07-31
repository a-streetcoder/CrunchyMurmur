# CrunchyMurmur Tauri transcription adapter

This alpha Tauri 2 desktop plugin links CrunchyMurmur's Rust engine
directly into a Windows, macOS, or Linux application. It does not start a
sidecar, capture a microphone, download models, send telemetry, or use a
network after the host has installed a model.

The crate and JavaScript guest package are published together from an immutable
`sdk-v<version>` tag after their shared release checks pass.

The current native engine dependency requires Rust 1.88 or newer.

## Host setup

Add the Rust crate to the Tauri application's `src-tauri/Cargo.toml` and
register it with one or more existing, host-owned recording directories:

```rust
let transcription = tauri_plugin_crunchymurmur_transcribe::PluginConfig::new()
    .allow_audio_root(recordings_directory);

tauri::Builder::default()
    .plugin(tauri_plugin_crunchymurmur_transcribe::init(transcription))
    .run(tauri::generate_context!())
    .expect("failed to run Tauri application");
```

The configuration is deny-by-default: with no allowed audio roots, filesystem
transcription is unavailable. Canonical path checks prevent webview code from
reading files outside the configured directories.

The default permission set exposes privacy-safe diagnostics only. Grant the
commands needed by a trusted window in its Tauri capability:

```json
{
  "permissions": [
    "crunchymurmur-transcribe:allow-prepare",
    "crunchymurmur-transcribe:allow-transcribe",
    "crunchymurmur-transcribe:allow-dispose",
    "crunchymurmur-transcribe:allow-diagnostics"
  ]
}
```

Then call the guest API:

```js
import { createTranscriber } from '@crunchymurmur/transcribe-tauri';

const transcriber = createTranscriber({
  modelDirectory: applicationModelDirectory,
  trustedManifestSha256: verifiedRelease.models.parakeetV3.manifestSha256,
});
await transcriber.prepare();

const result = await transcriber.transcribe(
  { path: recordedWavPath },
  { language: 'auto' },
);
```

The host owns microphone permission, device selection, WAV creation, retention,
the allowed recording roots, and the authenticated source of the Model Profile
digest. Expose filesystem transcription commands only to trusted windows.

## Current preview boundary

- One model is kept warm and one inference runs at a time.
- Input is a local WAV-compatible audio path.
- Results are final `speech` or `no-speech` outcomes.
- Model manifests and every declared model file are verified before loading.
- Diagnostics read a lightweight snapshot without waiting for inference.
- Disposal waits for active inference before releasing the model.
- Cancellation, streaming PCM sessions, and packaged model delivery remain
  follow-up work.
