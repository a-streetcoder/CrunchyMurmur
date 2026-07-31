const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createTranscriptionController } = require('../examples/electron-chat/transcription-controller');
const { CATALOGS } = require('../examples/electron-chat/i18n');

test('chat demo sends a temporary WAV through the public SDK and removes it', async () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'crunchymurmur-sdk-demo-'));
  const calls = [];
  const controller = createTranscriptionController({
    temporaryDirectory: temporary,
    createTranscriber(options) {
      calls.push({ type: 'create', options });
      return {
        async prepare() {
          calls.push({ type: 'prepare' });
        },
        async transcribe(input, options) {
          calls.push({
            type: 'transcribe',
            input,
            options,
            bytes: fs.readFileSync(input.path),
          });
          return {
            text: 'Hello from the SDK',
            outcome: 'speech',
            inferenceMs: 21,
          };
        },
        async dispose() {
          calls.push({ type: 'dispose' });
        },
      };
    },
    resolveExecutable: () => 'native-runtime',
  });

  const result = await controller.transcribeWav({
    wavBytes: Uint8Array.from([82, 73, 70, 70]),
    modelDirectory: 'verified-model',
    trustedManifestSha256: 'a'.repeat(64),
    language: 'en',
  });

  assert.equal(result.text, 'Hello from the SDK');
  const transcription = calls.find((call) => call.type === 'transcribe');
  assert.deepEqual([...transcription.bytes], [82, 73, 70, 70]);
  assert.equal(fs.existsSync(transcription.input.path), false);
  assert.equal(calls[0].options.modelDirectory, 'verified-model');
  assert.equal(calls[0].options.resolveExecutable(), 'native-runtime');

  await controller.dispose();
  fs.rmSync(temporary, { recursive: true, force: true });
});

test('chat demo serialises concurrent engine configuration and inference', async () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'crunchymurmur-sdk-queue-'));
  let active = 0;
  let maximumActive = 0;
  const prepared = [];
  const controller = createTranscriptionController({
    temporaryDirectory: temporary,
    resolveExecutable: () => 'native-runtime',
    createTranscriber({ modelDirectory }) {
      return {
        async prepare() {
          prepared.push(modelDirectory);
        },
        async transcribe() {
          active += 1;
          maximumActive = Math.max(maximumActive, active);
          await new Promise((resolve) => setTimeout(resolve, 5));
          active -= 1;
          return { text: modelDirectory, outcome: 'speech', inferenceMs: 5 };
        },
        async dispose() {},
      };
    },
  });

  const request = (modelDirectory, byte) => controller.transcribeWav({
    wavBytes: Uint8Array.from([byte]),
    modelDirectory,
    trustedManifestSha256: 'a'.repeat(64),
  });
  const results = await Promise.all([request('model-a', 1), request('model-b', 2)]);

  assert.equal(maximumActive, 1);
  assert.deepEqual(prepared, ['model-a', 'model-b']);
  assert.deepEqual(results.map((result) => result.text), ['model-a', 'model-b']);
  await controller.dispose();
  fs.rmSync(temporary, { recursive: true, force: true });
});

test('chat demo provides every message in each supported interface locale', () => {
  const supported = ['en', 'it', 'es', 'pt', 'fr', 'de', 'da', 'no', 'sv', 'zh', 'ko', 'ja'];
  assert.deepEqual(Object.keys(CATALOGS), supported);
  const messages = Object.keys(CATALOGS.en).sort();
  for (const locale of supported) {
    assert.deepEqual(
      Object.keys(CATALOGS[locale]).sort(),
      messages,
      `${locale} is missing a chat demo message`,
    );
    for (const key of messages) {
      assert.ok(CATALOGS[locale][key].trim(), `${locale}.${key} is empty`);
    }
  }
});
