# `@crunchymurmur/transcribe-node`

Alpha Node.js and Electron adapter for CrunchyMurmur's on-device transcription
engine.

This package owns the persistent sidecar process and exposes a small host API.
The host application still owns microphone permissions, recording, and model
downloads.

```js
const { createLocalTranscriber } = require('@crunchymurmur/transcribe-node');

const transcriber = createLocalTranscriber({
  modelDirectory: '/path/to/parakeet-model',
  trustedManifestSha256: verifiedRelease.models.parakeetV3.manifestSha256,
});

await transcriber.prepare();

const result = await transcriber.transcribe({
  path: '/path/to/audio.wav',
}, {
  language: 'en',
});

console.log(result.text, result.outcome);
```

The adapter discovers `crunchymurmur-transcriber` from
`CRUNCHYMURMUR_TRANSCRIBER_PATH`, `PATH`, or Cargo's binary directory. During
repository development, install the runtime with:

```sh
cargo install --path native/transcriber
```

After the first registry release, the equivalent version-pinned command is:

```sh
cargo install crunchymurmur-transcriber --version 0.1.0-alpha.1 --locked
```

Production applications may instead ship a verified platform runtime and pass
their own `resolveExecutable` function. The alpha public seam is `prepare`,
`transcribe`, `diagnostics`, and `dispose`.

Production hosts must authenticate the Model Profile manifest digest through a
signed release index or signed application configuration. Development tools
may set `allowUntrustedProfile: true` explicitly; release builds should not.
