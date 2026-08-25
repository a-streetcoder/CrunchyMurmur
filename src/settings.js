const fs = require('fs');
const path = require('path');
const { app, safeStorage } = require('electron');
const { atomicWriteFileSync } = require('./file-utils');

const SECRET_MASK = '••••••••';

function defaultHotkey(platform = process.platform) {
  if (platform === 'win32') return 'Control+Super';
  if (platform === 'darwin') return 'Fn';
  return 'CommandOrControl+Shift+Space';
}

function normalizeMicDeviceId(value) {
  const deviceId = String(value || '').trim();
  const alias = deviceId.toLowerCase();
  return alias === 'default' || alias === 'communications' ? '' : deviceId;
}

const DEFAULTS = {
  uiLocale: 'system', // system | supported BCP 47 language code
  theme: 'system', // 'system' | 'light' | 'dark'
  overlayX: '',
  overlayY: '',
  engineKind: 'parakeet', // 'parakeet' | 'local' (Whisper) | 'groq'
  parakeetModelPath: '',
  whisperCliPath: '',
  modelPath: '',
  language: 'auto',
  groqApiKey: '',
  groqModel: 'whisper-large-v3-turbo',
  micDeviceId: '', // '' = OS default mic
  hotkey: defaultHotkey(),
  hotkeyCustomized: 'false',
  autoUpdate: 'true',
  updateChannel: 'stable', // stable | nightly
  allowUpdateDowngrade: 'false', // confirmed Nightly -> Stable replacement is pending
  audioRetentionPolicy: 'never', // never | after_transcription | 1 | 7 | 30
  aiFormatEnabled: 'false',
  groqFormatModel: 'llama-3.1-8b-instant',
  aiFormatFallback: 'raw', // raw | anthropic
  aiFormatSystemPrompt: '', // '' = use the built-in formatter prompt

  // AI Notes
  aiNotesProvider: 'anthropic',  // 'anthropic' | 'openai' (claudeCode/codex coming later)
  anthropicApiKey: '',
  anthropicModel: 'claude-sonnet-4-6',
  openaiApiKey: '',
  openaiModel: 'gpt-4o',
  groqNotesModel: 'openai/gpt-oss-120b',
  claudeCodeModel: '',
  claudeCodeEffort: 'medium',
  codexModel: '',
  codexReasoningEffort: 'medium',
};

function configPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function readRaw() {
  try {
    return JSON.parse(fs.readFileSync(configPath(), 'utf8'));
  } catch {
    return {};
  }
}

function writeRaw(obj) {
  atomicWriteFileSync(configPath(), JSON.stringify(obj, null, 2), 'utf8');
}

// API key handling uses Electron safeStorage (DPAPI, Keychain, or a Linux
// desktop secret store). If it is unavailable, plaintext fallback is logged.

// Maps cleartext field name → on-disk pair name. Each cleartext key is
// stripped before persistence and rehydrated on load.
const ENCRYPTED_KEYS = [
  { plain: 'groqApiKey',      encName: 'groqApiKeyEncrypted',      plainName: 'groqApiKeyPlain' },
  { plain: 'anthropicApiKey', encName: 'anthropicApiKeyEncrypted', plainName: 'anthropicApiKeyPlain' },
  { plain: 'openaiApiKey',    encName: 'openaiApiKeyEncrypted',    plainName: 'openaiApiKeyPlain' },
];

function decryptKey(raw, encName, plainName) {
  if (raw[encName]) {
    try {
      if (safeStorage.isEncryptionAvailable()) {
        return safeStorage.decryptString(Buffer.from(raw[encName], 'base64'));
      }
    } catch (e) {
      console.warn(`[settings] failed to decrypt ${encName}:`, e.message);
    }
  }
  return raw[plainName] || '';
}

function encryptKey(plain) {
  if (!plain) return { encrypted: '', cleartext: '' };
  if (safeStorage.isEncryptionAvailable()) {
    return {
      encrypted: safeStorage.encryptString(plain).toString('base64'),
      cleartext: '',
    };
  }
  console.warn('[settings] safeStorage not available — API key stored in plaintext.');
  return { encrypted: '', cleartext: plain };
}

function load() {
  const raw = readRaw();
  const cfg = { ...DEFAULTS, ...raw };
  cfg.micDeviceId = normalizeMicDeviceId(cfg.micDeviceId);
  if (!['stable', 'nightly'].includes(cfg.updateChannel)) cfg.updateChannel = 'stable';
  if (!['true', 'false'].includes(cfg.allowUpdateDowngrade)) cfg.allowUpdateDowngrade = 'false';
  if (!raw.audioRetentionPolicy && raw.meetingRetentionDays) {
    cfg.audioRetentionPolicy = raw.meetingRetentionDays === '0' ? 'never' : raw.meetingRetentionDays;
  }
  if (process.platform === 'win32' && raw.hotkeyCustomized !== 'true'
      && (!raw.hotkey || raw.hotkey === 'CommandOrControl+Shift+Space')) {
    cfg.hotkey = 'Control+Super';
  }
  if (process.platform === 'darwin' && raw.hotkeyCustomized !== 'true'
      && (!raw.hotkey || raw.hotkey === 'CommandOrControl+Shift+Space')) {
    cfg.hotkey = 'Fn';
  }
  // Rehydrate each cleartext API-key field from its on-disk encrypted pair.
  for (const k of ENCRYPTED_KEYS) {
    cfg[k.plain] = decryptKey(raw, k.encName, k.plainName);
    delete cfg[k.encName];
    delete cfg[k.plainName];
  }
  return cfg;
}

function save(partial) {
  const raw = readRaw();
  const stored = { ...raw };

  for (const k of Object.keys(partial || {})) {
    if (!Object.hasOwn(DEFAULTS, k)) continue;
    if (ENCRYPTED_KEYS.some((e) => e.plain === k)) continue; // handled below
    const value = k === 'micDeviceId' ? normalizeMicDeviceId(partial[k]) : partial[k];
    stored[k] = String(value ?? '').slice(0, 10_000);
  }

  for (const k of ENCRYPTED_KEYS) {
    if (partial && k.plain in partial) {
      if (partial[k.plain] === SECRET_MASK) continue;
      const value = String(partial[k.plain] || '').slice(0, 10_000);
      const { encrypted, cleartext } = encryptKey(value);
      stored[k.encName] = encrypted;
      stored[k.plainName] = cleartext;
      delete stored[k.plain]; // never persist cleartext field with this name
    }
  }

  writeRaw(stored);
  return load();
}

function publicView(cfg = load()) {
  const out = { ...cfg };
  for (const k of ENCRYPTED_KEYS) out[k.plain] = cfg[k.plain] ? SECRET_MASK : '';
  return out;
}

module.exports = { load, save, publicView, configPath, DEFAULTS, SECRET_MASK, defaultHotkey };
