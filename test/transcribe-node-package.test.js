const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');

const {
  OnDeviceTranscriber,
  TranscriptionError,
  createLocalTranscriber,
  parakeetSupportsLanguage,
} = require('../packages/transcribe-node');

function fakeHelper() {
  const child = new EventEmitter();
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = () => {
    child.killed = true;
    child.emit('exit', null);
  };
  return child;
}

test('package exposes the desktop transcription primitives', () => {
  assert.equal(typeof OnDeviceTranscriber, 'function');
  assert.equal(typeof TranscriptionError, 'function');
  assert.equal(typeof createLocalTranscriber, 'function');
  assert.equal(parakeetSupportsLanguage('en'), true);
  assert.equal(parakeetSupportsLanguage('ja'), false);
});

test('package preserves stable native engine errors', async () => {
  const child = fakeHelper();
  child.stdin.write = (_line, callback) => {
    callback?.();
    queueMicrotask(() => {
      child.stdout.write(`${JSON.stringify({
        ok: false,
        error: 'The selected model is unavailable.',
        errorCode: 'MODEL_NOT_FOUND',
        recoverable: true,
      })}\n`);
    });
    return true;
  };
  const transcriber = new OnDeviceTranscriber({
    resolveExecutable: () => 'helper',
    spawnProcess: () => child,
  });

  await assert.rejects(
    transcriber.prepare({ parakeetModelPath: 'missing-model' }),
    (error) => error instanceof TranscriptionError
      && error.code === 'MODEL_NOT_FOUND'
      && error.recoverable === true,
  );
});

test('default-first package API requires an authenticated model manifest', async () => {
  const transcriber = createLocalTranscriber({
    modelDirectory: 'model',
    resolveExecutable: () => 'helper',
  });

  await assert.rejects(
    transcriber.prepare(),
    (error) => error instanceof TranscriptionError
      && error.code === 'MODEL_UNTRUSTED'
      && error.recoverable === false,
  );
});
