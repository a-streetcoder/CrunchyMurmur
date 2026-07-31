const test = require('node:test');
const assert = require('node:assert/strict');

test('Tauri guest adapter maps the default-first API to scoped plugin commands', async () => {
  const { createTranscriber } = await import('../packages/transcribe-tauri/index.js');
  const calls = [];
  const transcriber = createTranscriber(async (command, payload) => {
    calls.push({ command, payload });
    if (command.endsWith('|prepare')) {
      return { modelId: 'parakeet-v3-int8', modelVersion: '1.0.0' };
    }
    if (command.endsWith('|transcribe')) {
      return { text: 'hello', outcome: 'speech', inferenceMs: 12 };
    }
    return null;
  });

  await transcriber.prepare({
    modelDirectory: '/models/parakeet',
    trustedManifestSha256: 'digest',
  });
  const result = await transcriber.transcribe(
    { path: '/audio/message.wav' },
    { language: 'en' },
  );
  await transcriber.dispose();

  assert.equal(result.text, 'hello');
  assert.deepEqual(calls, [
    {
      command: 'plugin:crunchymurmur-transcribe|prepare',
      payload: {
        options: {
          modelDirectory: '/models/parakeet',
          trustedManifestSha256: 'digest',
        },
      },
    },
    {
      command: 'plugin:crunchymurmur-transcribe|transcribe',
      payload: {
        input: { path: '/audio/message.wav' },
        options: { language: 'en' },
      },
    },
    {
      command: 'plugin:crunchymurmur-transcribe|dispose',
      payload: undefined,
    },
  ]);
});

test('Tauri guest adapter rejects malformed audio before invoking Rust', async () => {
  const { createTranscriber, TranscriptionError } = await import(
    '../packages/transcribe-tauri/index.js'
  );
  const transcriber = createTranscriber(async () => {
    throw new Error('invoke should not be called');
  });

  await assert.rejects(
    transcriber.transcribe({}),
    (error) => error instanceof TranscriptionError
      && error.code === 'AUDIO_INVALID',
  );
});
