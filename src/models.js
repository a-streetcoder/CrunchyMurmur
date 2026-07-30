const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const https = require('https');
const { app } = require('electron');
const { atomicWriteFileSync } = require('./file-utils');
const { createModelProfileManifest } = require('./model-profile');

// Curated subset of whisper.cpp ggml models on HuggingFace. Sizes are bytes
// of the .bin file as published on the LFS endpoint, used for the progress
// bar and disk-usage display. If HuggingFace ever republishes a different
// build the size will mismatch by a few %; that's cosmetic, the download
// still works.
const CATALOG = [
  {
    id: 'parakeet-v3',
    family: 'parakeet',
    name: 'Parakeet V3',
    size: 670_619_803,
    language: '25 European languages',
    speed: 'Fast',
    accuracy: 'High',
    recommended: true,
    directory: 'parakeet-tdt-0.6b-v3-int8',
    files: [
      { name: 'encoder-model.int8.onnx', size: 652_183_999, sha256: '6139d2fa7e1b086097b277c7149725edbab89cc7c7ae64b23c741be4055aff09' },
      { name: 'decoder_joint-model.int8.onnx', size: 18_202_004, sha256: 'eea7483ee3d1a30375daedc8ed83e3960c91b098812127a0d99d1c8977667a70' },
      { name: 'nemo128.onnx', size: 139_764, sha256: 'a9fde1486ebfcc08f328d75ad4610c67835fea58c73ba57e3209a6f6cf019e9f' },
      { name: 'vocab.txt', size: 93_939, sha256: 'd58544679ea4bc6ac563d1f545eb7d474bd6cfa467f0a6e2c1dc1c7d37e3c35d' },
      { name: 'config.json', size: 97, sha256: '666903c76b9798caf2c210afd4f6cd60b08a8dbf9800ec8d7a3bc0d2148ac466' },
    ],
  },
  {
    id: 'tiny.en',
    family: 'whisper',
    name: 'Tiny English',
    size: 77_700_000,
    language: 'English only',
    speed: 'Fastest',
    accuracy: 'Lowest',
  },
  {
    id: 'base',
    family: 'whisper',
    name: 'Base',
    size: 147_900_000,
    language: 'Multilingual',
    speed: 'Very fast',
    accuracy: 'Low',
  },
  {
    id: 'small',
    family: 'whisper',
    name: 'Small',
    size: 487_600_000,
    language: 'Multilingual',
    speed: 'Fast',
    accuracy: 'OK',
  },
  {
    id: 'medium',
    family: 'whisper',
    name: 'Medium',
    size: 1_530_000_000,
    language: 'Multilingual',
    speed: 'Slow',
    accuracy: 'Good',
  },
  {
    id: 'large-v3-turbo-q5_0',
    family: 'whisper',
    name: 'Large v3 Turbo (Q5)',
    size: 574_000_000,
    language: 'Multilingual',
    speed: 'Fast',
    accuracy: 'Excellent',
  },
  {
    id: 'large-v3-turbo',
    family: 'whisper',
    name: 'Large v3 Turbo',
    size: 1_620_000_000,
    language: 'Multilingual',
    speed: 'Medium',
    accuracy: 'Excellent',
  },
  {
    id: 'large-v3',
    family: 'whisper',
    name: 'Large v3',
    size: 3_100_000_000,
    language: 'Multilingual',
    speed: 'Slowest',
    accuracy: 'Best',
  },
];

function modelsDir() {
  const dir = path.join(app.getPath('userData'), 'Models');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function modelFilePath(id) {
  validateModelId(id);
  const entry = CATALOG.find((model) => model.id === id);
  if (entry?.directory) return path.join(modelsDir(), entry.directory);
  return path.join(modelsDir(), `ggml-${id}.bin`);
}

function validateModelId(id) {
  if (typeof id !== 'string' || !/^[a-zA-Z0-9._-]+$/.test(id)) throw new Error('Invalid model id.');
  return id;
}

function metadataPath(id) {
  const entry = CATALOG.find((model) => model.id === id);
  return entry?.directory
    ? path.join(modelsDir(), `.${id}.metadata.json`)
    : modelFilePath(id) + '.metadata.json';
}

function modelUrl(id) {
  const entry = CATALOG.find((model) => model.id === id);
  if (entry?.url) return entry.url;
  return `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-${id}.bin`;
}

function parakeetFileUrl(filename) {
  return `https://huggingface.co/istupakov/parakeet-tdt-0.6b-v3-onnx/resolve/main/${encodeURIComponent(filename)}`;
}

// Active downloads — one entry per model id while a download is in flight.
// Allows the renderer to cancel by id.
const active = new Map();
const DOWNLOAD_INACTIVITY_TIMEOUT_MS = 60_000;

function isInstalled(id) {
  try {
    const catalogEntry = CATALOG.find((m) => m.id === id);
    if (catalogEntry?.directory) {
      const directory = modelFilePath(id);
      return catalogEntry.files.every((file) => {
        const stat = fs.statSync(path.join(directory, file.name));
        return stat.isFile() && stat.size === file.size;
      });
    }
    const bytes = fs.statSync(modelFilePath(id)).size;
    if (bytes < 1024 * 1024) return false;
    try {
      const metadata = JSON.parse(fs.readFileSync(metadataPath(id), 'utf8'));
      if (Number.isFinite(metadata.expectedBytes) && metadata.expectedBytes > 0) {
        return bytes === metadata.expectedBytes;
      }
    } catch {}
    return !catalogEntry || (bytes >= catalogEntry.size * 0.8 && bytes <= catalogEntry.size * 1.2);
  } catch {
    return false;
  }
}

function listInstalled() {
  // Return both catalog entries that are present and any other ggml-*.bin the
  // user dropped in manually — so external downloads still show up in the UI.
  const dir = modelsDir();
  const files = fs.readdirSync(dir).filter((f) => f.startsWith('ggml-') && f.endsWith('.bin'));
  const out = CATALOG.filter((model) => model.directory && isInstalled(model.id)).map((model) => ({
    id: model.id,
    family: model.family,
    name: model.name,
    bytes: model.size,
    path: modelFilePath(model.id),
    external: false,
  }));
  for (const f of files) {
    const id = f.slice('ggml-'.length, -'.bin'.length);
    if (!isInstalled(id)) continue;
    const stat = fs.statSync(path.join(dir, f));
    const meta = CATALOG.find((m) => m.id === id);
    out.push({
      id,
      family: 'whisper',
      name: meta ? meta.name : id,
      bytes: stat.size,
      path: path.join(dir, f),
      external: !meta,
    });
  }
  return out;
}

function getCatalog() {
  return CATALOG.map((m) => ({
    ...m,
    installed: isInstalled(m.id),
    path: isInstalled(m.id) ? modelFilePath(m.id) : null,
  }));
}

function removeModel(id) {
  validateModelId(id);
  // Cancel an active download too (in case the user hits delete while the
  // download is running).
  cancelDownload(id);
  const p = modelFilePath(id);
  const entry = CATALOG.find((model) => model.id === id);
  if (fs.existsSync(p)) {
    if (entry?.directory) fs.rmSync(p, { recursive: true, force: true });
    else fs.unlinkSync(p);
  }
  const partial = p + '.partial';
  if (fs.existsSync(partial)) fs.unlinkSync(partial);
  const archivePartial = path.join(modelsDir(), `.${id}.tar.gz.partial`);
  if (fs.existsSync(archivePartial)) fs.unlinkSync(archivePartial);
  const metadata = metadataPath(id);
  if (fs.existsSync(metadata)) fs.unlinkSync(metadata);
  return true;
}

function cancelDownload(id) {
  validateModelId(id);
  const a = active.get(id);
  if (!a) return false;
  a.canceled = true;
  try { a.req.destroy(); } catch {}
  return true;
}

/**
 * Stream-download a model. `onProgress({ id, bytesDone, bytesTotal })` fires
 * on every flush; ~throttled by stream chunk size, so don't try to drive a
 * 60-fps UI off it. Resolves when the file is fully written and renamed
 * into place; rejects on network error, HTTP error, or cancel.
 */
function downloadModel(id, onProgress) {
  const directoryMeta = CATALOG.find((model) => model.id === id && model.directory);
  if (directoryMeta) return downloadDirectoryModel(directoryMeta, onProgress);
  return new Promise((resolve, reject) => {
    if (active.has(id)) {
      return reject(new Error('A download for this model is already in progress.'));
    }
    const meta = CATALOG.find((m) => m.id === id);
    if (!meta) return reject(new Error('Unknown model id: ' + id));

    const finalPath = modelFilePath(id);
    const partialPath = finalPath + '.partial';

    if (isInstalled(id)) {
      return resolve({ id, path: finalPath });
    }

    const fileStream = fs.createWriteStream(partialPath);
    let bytesDone = 0;
    let bytesTotal = meta.size; // updated from Content-Length when available
    let expectedDownloadBytes = null;

    const handleResponse = (res, redirects = 0) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        if (redirects >= 5) return onError(new Error('Too many model download redirects.'));
        const nextUrl = new URL(res.headers.location, modelUrl(id));
        if (nextUrl.protocol !== 'https:') return onError(new Error('Model download redirected to an insecure URL.'));
        const next = https.get(nextUrl, (nextRes) => handleResponse(nextRes, redirects + 1));
        next.on('error', onError);
        const entry = active.get(id);
        if (entry) entry.req = next;
        return;
      }
      if (res.statusCode !== 200) {
        return onError(new Error(`HTTP ${res.statusCode} from HuggingFace`));
      }
      const total = Number(res.headers['content-length']);
      if (Number.isFinite(total) && total > 0) {
        bytesTotal = total;
        expectedDownloadBytes = total;
      }

      res.on('data', (chunk) => {
        bytesDone += chunk.length;
        try { onProgress && onProgress({ id, bytesDone, bytesTotal }); } catch {}
      });
      res.on('error', onError);
      res.pipe(fileStream);
    };

    const onError = (err) => {
      if (!active.has(id)) return; // already cleaned up
      const entry = active.get(id);
      active.delete(id);
      try { fileStream.destroy(); } catch {}
      try { if (fs.existsSync(partialPath)) fs.unlinkSync(partialPath); } catch {}
      reject(entry?.canceled ? new Error('Download canceled') : err);
    };

    fileStream.on('finish', () => {
      const entry = active.get(id);
      if (!entry) return; // already errored / canceled
      active.delete(id);
      if (entry.canceled) {
        try { if (fs.existsSync(partialPath)) fs.unlinkSync(partialPath); } catch {}
        return reject(new Error('Download canceled'));
      }
      try {
        const actualBytes = fs.statSync(partialPath).size;
        if (actualBytes !== bytesDone || (expectedDownloadBytes && actualBytes !== expectedDownloadBytes)) {
          throw new Error(`Incomplete model download: expected ${expectedDownloadBytes || bytesDone} bytes, received ${actualBytes}.`);
        }
        fs.renameSync(partialPath, finalPath);
        atomicWriteFileSync(metadataPath(id), JSON.stringify({
          id,
          expectedBytes: actualBytes,
          source: modelUrl(id),
          downloadedAt: new Date().toISOString(),
        }, null, 2), 'utf8');
      } catch (e) {
        try { if (fs.existsSync(partialPath)) fs.unlinkSync(partialPath); } catch {}
        return reject(e);
      }
      resolve({ id, path: finalPath });
    });
    fileStream.on('error', onError);

    const req = https.get(modelUrl(id), {
      headers: { 'User-Agent': 'CrunchyMurmur' },
    }, (res) => handleResponse(res, 0));
    req.on('error', onError);

    active.set(id, { req, canceled: false });
  });
}

async function downloadDirectoryModel(meta, onProgress) {
  const { id } = meta;
  if (active.has(id)) throw new Error('A download for this model is already in progress.');
  const finalPath = modelFilePath(id);
  if (isInstalled(id)) return { id, path: finalPath };
  const partialPath = path.join(modelsDir(), `.${id}.partial`);
  fs.rmSync(partialPath, { recursive: true, force: true });
  fs.mkdirSync(partialPath, { recursive: true });
  const entry = { req: null, canceled: false };
  active.set(id, entry);
  let completedBytes = 0;

  try {
    for (const file of meta.files) {
      if (entry.canceled) throw new Error('Download canceled');
      const target = path.join(partialPath, file.name);
      await new Promise((resolve, reject) => {
        const stream = fs.createWriteStream(target);
        const digest = crypto.createHash('sha256');
        let fileBytes = 0;
        let response = null;
        let inactivityTimer = null;
        let settled = false;
        const clearInactivity = () => {
          if (inactivityTimer) clearTimeout(inactivityTimer);
          inactivityTimer = null;
        };
        const resetInactivity = () => {
          clearInactivity();
          inactivityTimer = setTimeout(() => {
            const error = new Error(`Model download stalled while receiving ${file.name}.`);
            try { response?.destroy(error); } catch {}
            try { entry.req?.destroy(error); } catch {}
            fail(error);
          }, DOWNLOAD_INACTIVITY_TIMEOUT_MS);
          inactivityTimer.unref?.();
        };
        const fail = (error) => {
          if (settled) return;
          settled = true;
          clearInactivity();
          try { stream.destroy(); } catch {}
          reject(entry.canceled ? new Error('Download canceled') : error);
        };
        const request = (url, redirects = 0) => {
          const req = https.get(url, { headers: { 'User-Agent': 'CrunchyMurmur' } }, (res) => {
            response = res;
            resetInactivity();
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
              clearInactivity();
              res.resume();
              if (redirects >= 5) return fail(new Error('Too many model download redirects.'));
              const next = new URL(res.headers.location, url);
              if (next.protocol !== 'https:') return fail(new Error('Model download redirected to an insecure URL.'));
              request(next, redirects + 1);
              return;
            }
            if (res.statusCode !== 200) return fail(new Error(`HTTP ${res.statusCode} from HuggingFace`));
            res.on('data', (chunk) => {
              resetInactivity();
              fileBytes += chunk.length;
              digest.update(chunk);
              try { onProgress?.({ id, bytesDone: completedBytes + fileBytes, bytesTotal: meta.size }); } catch {}
            });
            res.on('end', clearInactivity);
            res.on('error', fail);
            res.pipe(stream);
          });
          req.on('error', fail);
          entry.req = req;
        };
        stream.on('finish', () => {
          if (settled) return;
          clearInactivity();
          if (fileBytes !== file.size) return fail(new Error(`Incomplete model file: ${file.name}`));
          if (digest.digest('hex') !== file.sha256) return fail(new Error(`Checksum mismatch for model file: ${file.name}`));
          settled = true;
          resolve();
        });
        stream.on('error', fail);
        request(parakeetFileUrl(file.name));
      });
      completedBytes += file.size;
    }
    atomicWriteFileSync(
      path.join(partialPath, 'crunchymurmur-model.json'),
      JSON.stringify(createModelProfileManifest(meta), null, 2),
      'utf8',
    );
    fs.rmSync(finalPath, { recursive: true, force: true });
    fs.renameSync(partialPath, finalPath);
    if (!isInstalled(id)) throw new Error('The downloaded Parakeet model is incomplete.');
    atomicWriteFileSync(metadataPath(id), JSON.stringify({
      id,
      expectedBytes: meta.size,
      source: 'https://huggingface.co/istupakov/parakeet-tdt-0.6b-v3-onnx',
      downloadedAt: new Date().toISOString(),
    }, null, 2), 'utf8');
    return { id, path: finalPath };
  } finally {
    active.delete(id);
    if (fs.existsSync(partialPath)) fs.rmSync(partialPath, { recursive: true, force: true });
  }
}

module.exports = {
  CATALOG,
  modelsDir,
  modelFilePath,
  isInstalled,
  listInstalled,
  getCatalog,
  removeModel,
  downloadModel,
  cancelDownload,
};
