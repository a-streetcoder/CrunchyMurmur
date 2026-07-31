# SDK chat demo

This Electron application demonstrates the public
`@crunchymurmur/transcribe-node` interface in a chat composer. Its Host Recorder
captures microphone PCM, writes a short-lived WAV through the isolated main
process, and passes only that local path to the On-device Engine. The temporary
file is removed after every successful or failed transcription.

The demo does not call a chat provider. Sending a message adds a local example
reply, so the transcription integration can be evaluated without an account,
network service, or API key.

## Run from this repository

Requirements:

- Node.js 22.12 or newer;
- Rust 1.88 or newer and the native build tools for your platform;
- a downloaded CrunchyMurmur Parakeet Model Profile;
- microphone permission.

Build the local runtime once:

```powershell
npm run prepare:transcriber:win
```

On macOS or Linux, use `prepare:transcriber:mac` or
`prepare:transcriber:linux`. Then install and start the independent example:

```powershell
npm run demo:chat:install
npm run demo:chat
```

The demo resolves the runtime from `CRUNCHYMURMUR_TRANSCRIBER_PATH`, this
repository's `build/transcriber-runtime` directory, `PATH`, or Cargo's binary
directory, in that order.

## Run from an SDK GitHub release

The SDK prerelease ZIP includes this example and its exact Node adapter under
`packages/transcribe-node`. After extracting it, install the native runtime and
start the example:

```sh
cargo install crunchymurmur-transcriber --version 0.1.0-alpha.1 --locked
cd examples/electron-chat
npm ci
npm start
```

Open **Transcription setup** and provide:

1. the directory containing `crunchymurmur-model.json` and its declared model
   files;
2. the SHA-256 digest of that manifest from an authenticated release source;
3. the spoken language, or `Auto`.

For local development, calculate the manifest digest only after independently
verifying that the Model Profile came from the expected CrunchyMurmur release:

```powershell
(Get-FileHash -Algorithm SHA256 C:\path\to\crunchymurmur-model.json).Hash.ToLower()
```

The digest is a trust input, not a substitute for verifying the release that
provided it.

## Security shape

- `contextIsolation`, renderer sandboxing, and a narrow preload interface are
  enabled.
- The renderer cannot access Node.js, the native process, or arbitrary files.
- Recorded WAV input is limited to 25 MB and stored with a unique name.
- Temporary audio is deleted in a `finally` block.
- The On-device Engine performs no network requests or telemetry.
