const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const MAX_WAV_BYTES = 25 * 1024 * 1024;

function createTranscriptionController({
  createTranscriber,
  resolveExecutable,
  temporaryDirectory = os.tmpdir(),
  fileSystem = fs,
} = {}) {
  if (typeof createTranscriber !== 'function') {
    throw new TypeError('createTranscriber is required.');
  }
  if (typeof resolveExecutable !== 'function') {
    throw new TypeError('resolveExecutable is required.');
  }

  let transcriber = null;
  let activeConfiguration = '';

  async function configuredTranscriber(modelDirectory, trustedManifestSha256) {
    const directory = String(modelDirectory || '').trim();
    const digest = String(trustedManifestSha256 || '').trim().toLowerCase();
    if (!directory) throw new TypeError('A Model Profile directory is required.');
    if (!/^[a-f0-9]{64}$/.test(digest)) {
      throw new TypeError('A trusted 64-character SHA-256 manifest digest is required.');
    }
    const configuration = JSON.stringify([directory, digest]);
    if (transcriber && configuration === activeConfiguration) return transcriber;
    await transcriber?.dispose();
    transcriber = createTranscriber({
      modelDirectory: directory,
      trustedManifestSha256: digest,
      resolveExecutable,
    });
    activeConfiguration = configuration;
    await transcriber.prepare();
    return transcriber;
  }

  return {
    async transcribeWav({
      wavBytes,
      modelDirectory,
      trustedManifestSha256,
      language = 'auto',
    } = {}) {
      if (!(wavBytes instanceof Uint8Array) || wavBytes.byteLength === 0) {
        throw new TypeError('Recorded WAV audio is required.');
      }
      if (wavBytes.byteLength > MAX_WAV_BYTES) {
        throw new TypeError('Recorded WAV audio exceeds the 25 MB demo limit.');
      }
      const engine = await configuredTranscriber(modelDirectory, trustedManifestSha256);
      fileSystem.mkdirSync(temporaryDirectory, { recursive: true });
      const audioPath = path.join(
        temporaryDirectory,
        `crunchymurmur-chat-${crypto.randomUUID()}.wav`,
      );
      try {
        fileSystem.writeFileSync(audioPath, wavBytes, { mode: 0o600 });
        return await engine.transcribe({ path: audioPath }, { language });
      } finally {
        try {
          fileSystem.rmSync(audioPath, { force: true });
        } catch {}
      }
    },

    async diagnostics() {
      return transcriber?.diagnostics() || {
        state: 'idle',
        modelId: null,
        modelVersion: null,
        lastLoadMs: null,
        lastInferenceMs: null,
      };
    },

    async dispose() {
      await transcriber?.dispose();
      transcriber = null;
      activeConfiguration = '';
    },
  };
}

module.exports = { createTranscriptionController, MAX_WAV_BYTES };
