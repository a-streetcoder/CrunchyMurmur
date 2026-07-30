const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');

const { NativeTranscriptionService, parakeetSupportsLanguage } = require('../src/native-transcription-service');

function fakeHelper() {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.killed = false;
  child.stdin = {
    writable: true,
    write(line, callback) {
      const request = JSON.parse(line);
      if (request.action === 'load') child.stdout.write(`${JSON.stringify({ ok: true, loadMs: 1 })}\n`);
      callback?.();
    },
    end() {},
  };
  child.kill = () => { child.killed = true; };
  return child;
}

test('Parakeet accepts its 25 European languages and auto detection', () => {
  for (const language of ['auto', 'bg', 'hr', 'cs', 'da', 'nl', 'en', 'et', 'fi', 'fr', 'de', 'el', 'hu', 'it', 'lv', 'lt', 'mt', 'pl', 'pt', 'ro', 'sk', 'sl', 'es', 'sv', 'ru', 'uk']) {
    assert.equal(parakeetSupportsLanguage(language), true, language);
  }
});

test('Parakeet directs unsupported spoken languages to Whisper', () => {
  for (const language of ['zh', 'ja', 'ko', 'no', 'tr', 'ar', 'hi']) {
    assert.equal(parakeetSupportsLanguage(language), false, language);
  }
});

test('native transcription exposes stable engine errors to host applications', async () => {
  const child = fakeHelper();
  child.stdin.write = (line, callback) => {
    const request = JSON.parse(line);
    if (request.action === 'load') {
      child.stdout.write(`${JSON.stringify({
        ok: false,
        error: 'Parakeet model directory was not found.',
        errorCode: 'MODEL_NOT_FOUND',
        recoverable: true,
      })}\n`);
    }
    callback?.();
  };
  const service = new NativeTranscriptionService({
    resolveExecutable: () => 'helper',
    spawnProcess: () => child,
  });

  await assert.rejects(
    service.prepare({ parakeetModelPath: 'missing' }),
    (error) => error.code === 'MODEL_NOT_FOUND'
      && error.recoverable === true
      && /not found/i.test(error.message),
  );
});

test('native transcription abort terminates an in-flight helper request', async () => {
  const child = fakeHelper();
  const service = new NativeTranscriptionService({ resolveExecutable: () => 'helper', spawnProcess: () => child });
  const controller = new AbortController();
  const pending = service.transcribe('audio.wav', { parakeetModelPath: 'model', language: 'en' }, { signal: controller.signal });
  await new Promise((resolve) => setImmediate(resolve));
  controller.abort();
  await assert.rejects(
    pending,
    (error) => error.code === 'CANCELLED'
      && error.recoverable === true
      && /cancelled/i.test(error.message),
  );
  assert.equal(child.killed, true);
});

test('native transcription times out and restarts an unresponsive helper', async () => {
  const child = fakeHelper();
  const service = new NativeTranscriptionService({
    resolveExecutable: () => 'helper',
    spawnProcess: () => child,
    inferenceTimeoutMs: 5,
  });
  await assert.rejects(
    service.transcribe('audio.wav', { parakeetModelPath: 'model', language: 'en' }),
    (error) => error.code === 'TIMED_OUT'
      && error.recoverable === true
      && /timed out/i.test(error.message),
  );
  assert.equal(child.killed, true);
});

test('concurrent preparation never reuses a different model load', async () => {
  const first = fakeHelper();
  first.stdin.write = (_line, callback) => callback?.();
  const second = fakeHelper();
  const children = [first, second];
  const service = new NativeTranscriptionService({
    resolveExecutable: () => 'helper',
    spawnProcess: () => children.shift(),
  });
  const loadingFirst = service.prepare({ parakeetModelPath: 'model-a' });
  await new Promise((resolve) => setImmediate(resolve));
  const loadingSecond = service.prepare({ parakeetModelPath: 'model-b' });
  first.stdout.write(`${JSON.stringify({ ok: true, loadMs: 1 })}\n`);
  await loadingFirst;
  const result = await loadingSecond;
  assert.equal(result.modelPath, 'model-b');
  assert.equal(service.diagnostics().modelPath, 'model-b');
  assert.equal(children.length, 0);
  service.dispose();
});

test('failed model preparation terminates its native helper', async () => {
  const child = fakeHelper();
  child.stdin.write = (_line, callback) => {
    child.stdout.write(`${JSON.stringify({
      ok: false,
      error: 'Model is invalid.',
      errorCode: 'MODEL_INVALID',
      recoverable: true,
    })}\n`);
    callback?.();
  };
  const service = new NativeTranscriptionService({
    resolveExecutable: () => 'helper',
    spawnProcess: () => child,
  });

  await assert.rejects(
    service.prepare({ parakeetModelPath: 'broken-model' }),
    (error) => error.code === 'MODEL_INVALID',
  );
  const killedAfterFailure = child.killed;
  const readyAfterFailure = service.diagnostics().ready;
  service.dispose();
  assert.equal(killedAfterFailure, true);
  assert.equal(readyAfterFailure, false);
});

test('a stale helper error cannot fail a replacement helper request', async () => {
  const first = fakeHelper();
  const second = fakeHelper();
  const children = [first, second];
  const service = new NativeTranscriptionService({
    resolveExecutable: () => 'helper',
    spawnProcess: () => children.shift(),
  });

  const firstLoad = service.prepare({ parakeetModelPath: 'model-a' });
  first.stdout.write(`${JSON.stringify({ ok: true, loadMs: 1 })}\n`);
  await firstLoad;

  const secondLoad = service.prepare({ parakeetModelPath: 'model-b' });
  await new Promise((resolve) => setImmediate(resolve));
  first.emit('error', new Error('late error from replaced helper'));
  second.stdout.write(`${JSON.stringify({ ok: true, loadMs: 1 })}\n`);

  const result = await secondLoad.catch((error) => error);
  service.dispose();
  assert.equal(result.modelPath, 'model-b');
});

test('busy failures are retained in diagnostics', async () => {
  const child = fakeHelper();
  const service = new NativeTranscriptionService({
    resolveExecutable: () => 'helper',
    spawnProcess: () => child,
  });
  await service.prepare({ parakeetModelPath: 'model' });

  const first = service.transcribe(
    'first.wav',
    { parakeetModelPath: 'model', language: 'en' },
  );
  await new Promise((resolve) => setImmediate(resolve));
  await assert.rejects(
    service.transcribe(
      'second.wav',
      { parakeetModelPath: 'model', language: 'en' },
    ),
    (error) => error.code === 'ENGINE_BUSY',
  );
  const lastError = service.diagnostics().lastError;
  service.dispose();
  await assert.rejects(first, (error) => error.code === 'DISPOSED');
  assert.match(lastError, /busy/i);
});
