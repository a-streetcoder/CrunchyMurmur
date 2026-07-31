const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  createLocalTranscriber,
  resolveTranscriberExecutable,
} = require('../packages/transcribe-node');

function successfulHelper() {
  const child = new EventEmitter();
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = () => {
    child.killed = true;
    child.emit('exit', null);
  };
  child.stdin.write = (line, callback) => {
    callback?.();
    const request = JSON.parse(line);
    queueMicrotask(() => {
      if (request.action === 'load') {
        child.stdout.write(`${JSON.stringify({
          ok: true,
          engineVersion: '0.1.0-alpha.1',
          modelId: 'parakeet-v3-int8',
          modelVersion: '1.0.0',
          loadMs: 18,
          reused: false,
        })}\n`);
      } else if (request.action === 'transcribe') {
        child.stdout.write(`${JSON.stringify({
          ok: true,
          text: 'Hello from the microphone',
          outcome: 'speech',
          inferenceMs: 42,
        })}\n`);
      }
    });
    return true;
  };
  return child;
}

test('Node adapter prepare returns the shared public engine information', async () => {
  const child = successfulHelper();
  const transcriber = createLocalTranscriber({
    modelDirectory: 'model',
    trustedManifestSha256: 'digest',
    resolveExecutable: () => 'helper',
    spawnProcess: () => child,
    logger: { info() {}, warn() {}, error() {} },
  });

  const information = await transcriber.prepare();

  assert.deepEqual(information, {
    engineVersion: '0.1.0-alpha.1',
    modelId: 'parakeet-v3-int8',
    modelVersion: '1.0.0',
    loadMs: 18,
    reused: false,
  });
  await transcriber.dispose();
});

test('Tauri adapter uses the same constructor-owned model configuration', async () => {
  const { createTranscriber } = await import('../packages/transcribe-tauri/index.js');
  const calls = [];
  const transcriber = createTranscriber({
    modelDirectory: '/models/parakeet',
    trustedManifestSha256: 'digest',
    invoke: async (command, payload) => {
      calls.push({ command, payload });
      return {
        engineVersion: '0.1.0-alpha.1',
        modelId: 'parakeet-v3-int8',
        modelVersion: '1.0.0',
        loadMs: 18,
        reused: false,
      };
    },
  });

  const information = await transcriber.prepare();

  assert.equal(information.modelId, 'parakeet-v3-int8');
  assert.deepEqual(calls, [{
    command: 'plugin:crunchymurmur-transcribe|prepare',
    payload: {
      options: {
        modelDirectory: '/models/parakeet',
        trustedManifestSha256: 'digest',
      },
    },
  }]);
});

test('Node adapter diagnostics match the privacy-safe shared shape', async () => {
  const child = successfulHelper();
  const transcriber = createLocalTranscriber({
    modelDirectory: 'C:\\private\\models\\parakeet',
    trustedManifestSha256: 'digest',
    resolveExecutable: () => 'C:\\private\\runtime\\transcriber.exe',
    spawnProcess: () => child,
    logger: { info() {}, warn() {}, error() {} },
  });
  await transcriber.prepare();

  assert.deepEqual(await transcriber.diagnostics(), {
    state: 'ready',
    modelId: 'parakeet-v3-int8',
    modelVersion: '1.0.0',
    lastLoadMs: 18,
    lastInferenceMs: null,
  });
  await transcriber.dispose();
});

test('Node adapter transcript matches the shared result shape', async () => {
  const child = successfulHelper();
  const transcriber = createLocalTranscriber({
    modelDirectory: 'model',
    trustedManifestSha256: 'digest',
    resolveExecutable: () => 'helper',
    spawnProcess: () => child,
    logger: { info() {}, warn() {}, error() {} },
  });

  const transcript = await transcriber.transcribe(
    { path: 'message.wav' },
    { language: 'en' },
  );

  assert.deepEqual(transcript, {
    text: 'Hello from the microphone',
    outcome: 'speech',
    language: 'en',
    inferenceMs: 42,
  });
  await transcriber.dispose();
});

test('Node adapter discovers an explicitly configured native runtime', (t) => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'crunchymurmur-runtime-'));
  const executable = path.join(
    temporary,
    process.platform === 'win32'
      ? 'crunchymurmur-transcriber.exe'
      : 'crunchymurmur-transcriber',
  );
  fs.writeFileSync(executable, '');
  if (process.platform !== 'win32') fs.chmodSync(executable, 0o755);
  const previous = process.env.CRUNCHYMURMUR_TRANSCRIBER_PATH;
  process.env.CRUNCHYMURMUR_TRANSCRIBER_PATH = executable;
  t.after(() => {
    if (previous === undefined) delete process.env.CRUNCHYMURMUR_TRANSCRIBER_PATH;
    else process.env.CRUNCHYMURMUR_TRANSCRIBER_PATH = previous;
    fs.rmSync(temporary, { recursive: true, force: true });
  });

  assert.equal(resolveTranscriberExecutable(), executable);
});

test('Node runtime discovery skips directories and non-executable files', (t) => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'crunchymurmur-runtime-candidates-'));
  const configuredDirectory = path.join(temporary, 'configured');
  const blockedDirectory = path.join(temporary, 'blocked');
  const validDirectory = path.join(temporary, 'valid');
  fs.mkdirSync(configuredDirectory);
  fs.mkdirSync(blockedDirectory);
  fs.mkdirSync(validDirectory);
  const executableName = process.platform === 'win32'
    ? 'crunchymurmur-transcriber.exe'
    : 'crunchymurmur-transcriber';
  if (process.platform !== 'win32') {
    fs.writeFileSync(path.join(blockedDirectory, executableName), '');
  }
  const validExecutable = path.join(validDirectory, executableName);
  fs.writeFileSync(validExecutable, '');
  fs.chmodSync(validExecutable, 0o755);
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));

  assert.equal(resolveTranscriberExecutable({
    env: {
      CRUNCHYMURMUR_TRANSCRIBER_PATH: configuredDirectory,
      PATH: `${blockedDirectory}${path.delimiter}${validDirectory}`,
      CARGO_HOME: path.join(temporary, 'cargo'),
    },
    platform: process.platform,
    homeDirectory: temporary,
  }), validExecutable);
});
