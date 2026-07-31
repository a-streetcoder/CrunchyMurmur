const path = require('node:path');
const { app, BrowserWindow, ipcMain } = require('electron');
const { createTranscriptionController, MAX_WAV_BYTES } = require('./transcription-controller');
const { resolveExecutable } = require('./runtime');

let window;
let controller;
let cleanupStarted = false;
let cleanupComplete = false;

function sdk() {
  try {
    return require('@crunchymurmur/transcribe-node');
  } catch (error) {
    if (error?.code !== 'MODULE_NOT_FOUND') throw error;
    return require('../../packages/transcribe-node');
  }
}

function transcriptionController() {
  if (!controller) {
    controller = createTranscriptionController({
      createTranscriber: sdk().createLocalTranscriber,
      resolveExecutable,
      temporaryDirectory: path.join(app.getPath('temp'), 'crunchymurmur-sdk-chat'),
    });
  }
  return controller;
}

function createWindow() {
  window = new BrowserWindow({
    width: 1120,
    height: 760,
    minWidth: 820,
    minHeight: 600,
    backgroundColor: '#f7f1e5',
    title: 'CrunchyMurmur SDK Chat',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  window.loadFile(path.join(__dirname, 'index.html'));
}

ipcMain.handle('chat-demo:transcribe', async (_event, request) => {
  const received = request?.wavBytes;
  const bytes = received instanceof Uint8Array
    ? received
    : ArrayBuffer.isView(received)
      ? new Uint8Array(received.buffer, received.byteOffset, received.byteLength)
      : received instanceof ArrayBuffer ? new Uint8Array(received) : null;
  if (!bytes || bytes.byteLength === 0 || bytes.byteLength > MAX_WAV_BYTES) {
    throw new TypeError('Invalid recorded audio.');
  }
  return transcriptionController().transcribeWav({ ...request, wavBytes: bytes });
});
ipcMain.handle('chat-demo:diagnostics', () => transcriptionController().diagnostics());

app.whenReady().then(createWindow);
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('before-quit', (event) => {
  if (cleanupComplete) return;
  event.preventDefault();
  if (cleanupStarted) return;
  cleanupStarted = true;
  Promise.resolve(controller?.dispose())
    .catch(() => {})
    .finally(() => {
      cleanupComplete = true;
      app.quit();
    });
});
