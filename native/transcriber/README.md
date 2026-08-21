# CrunchyMurmur On-device Engine

`crunchymurmur-transcriber` is the shared Rust implementation behind
CrunchyMurmur's Node/Electron and Tauri desktop adapters. It validates an
authenticated Model Profile, keeps one Parakeet model warm, validates local WAV
input, and returns a final speech or no-speech Transcript Outcome.

The crate contains both a reusable Rust library and the isolated JSON-lines
sidecar used by Node.js hosts. It does not capture a microphone, download a
model, send telemetry, or perform network requests.

This is an alpha interface. Start with the
[SDK guide](https://github.com/a-streetcoder/CrunchyMurmur/blob/main/docs/on-device-sdk.md)
and the host adapter documentation
before embedding it.
