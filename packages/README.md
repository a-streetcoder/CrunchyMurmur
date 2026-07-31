# On-device transcription packages

This directory contains the reusable host adapters built on CrunchyMurmur's
native Rust transcription engine.

| Package | Status | Purpose |
|---|---|---|
| [`@crunchymurmur/transcribe-node`](transcribe-node/) | Provisional, in-repository | Node.js and Electron main-process adapter |
| [`@crunchymurmur/transcribe-tauri`](transcribe-tauri/) | Provisional, in-repository | Tauri 2 guest bindings and direct Rust plugin |

The Rust library lives in [`native/transcriber`](../native/transcriber/). The
same crate builds both the reusable engine and CrunchyMurmur's isolated sidecar.
Keeping the desktop app on this shared implementation prevents the SDK and the
product from drifting.

The packages are not published yet. The first public preview still needs
automated platform publication, signed checksums, example applications,
benchmarks, and expanded conformance fixtures. See the SDK design documentation
for the complete delivery sequence.
