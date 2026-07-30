# `@crunchymurmur/transcribe-node`

Provisional Node.js and Electron adapter for CrunchyMurmur's on-device
transcription engine.

This package owns the persistent sidecar process and exposes a small host API.
The host application still owns microphone permissions, recording, and model
downloads.

```js
const { createLocalTranscriber } = require('@crunchymurmur/transcribe-node');

const transcriber = createLocalTranscriber({
  resolveExecutable: () => '/path/to/crunchymurmur-transcriber',
  modelDirectory: '/path/to/parakeet-model',
});

await transcriber.prepare();

const result = await transcriber.transcribe({
  path: '/path/to/audio.wav',
}, {
  language: 'en',
});

console.log(result.text, result.outcome);
```

The adapter is not published yet. Its API remains provisional until the first
standalone SDK preview.
