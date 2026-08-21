const i18n = window.demoI18n;
i18n.apply();

const elements = {
  setup: document.querySelector('#setup'),
  modelDirectory: document.querySelector('#modelDirectory'),
  digest: document.querySelector('#digest'),
  language: document.querySelector('#language'),
  saveSetup: document.querySelector('#saveSetup'),
  conversation: document.querySelector('#conversation'),
  emptyState: document.querySelector('#emptyState'),
  message: document.querySelector('#message'),
  record: document.querySelector('#record'),
  recordLabel: document.querySelector('#recordLabel'),
  send: document.querySelector('#send'),
  status: document.querySelector('#status'),
  statusText: document.querySelector('#statusText'),
};

let audioContext;
let mediaStream;
let recorderNode;
let silentGain;
let chunks = [];
let recording = false;
let maximumTimer;

function setStatus(key, busy = false) {
  elements.statusText.textContent = i18n.t(key);
  elements.status.classList.toggle('busy', busy);
}

function configuration() {
  return {
    modelDirectory: elements.modelDirectory.value.trim(),
    trustedManifestSha256: elements.digest.value.trim().toLowerCase(),
    language: elements.language.value,
  };
}

function loadConfiguration() {
  try {
    const saved = JSON.parse(localStorage.getItem('crunchymurmur-sdk-demo') || '{}');
    elements.modelDirectory.value = saved.modelDirectory || '';
    elements.digest.value = saved.trustedManifestSha256 || '';
    elements.language.value = saved.language || 'auto';
  } catch {}
}

function saveConfiguration() {
  localStorage.setItem('crunchymurmur-sdk-demo', JSON.stringify(configuration()));
  elements.setup.open = false;
  setStatus('ready');
}

function addMessage(text, kind) {
  elements.emptyState.hidden = true;
  const message = document.createElement('div');
  message.className = `message ${kind}`;
  message.textContent = text;
  elements.conversation.append(message);
  elements.conversation.scrollTop = elements.conversation.scrollHeight;
}

function sendMessage() {
  const text = elements.message.value.trim();
  if (!text) return;
  addMessage(text, 'user');
  elements.message.value = '';
  window.setTimeout(() => addMessage(i18n.t('demoReply'), 'assistant'), 260);
}

function mergeSamples(parts) {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const samples = new Float32Array(length);
  let offset = 0;
  for (const part of parts) {
    samples.set(part, offset);
    offset += part.length;
  }
  return samples;
}

function encodeWav(samples, sampleRate) {
  const bytes = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(bytes);
  const text = (offset, value) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };
  text(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index]));
    view.setInt16(44 + index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  return new Uint8Array(bytes);
}

async function startRecording() {
  const setup = configuration();
  if (!setup.modelDirectory || !/^[a-f0-9]{64}$/.test(setup.trustedManifestSha256)) {
    elements.setup.open = true;
    setStatus('setupRequired');
    return;
  }
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
    });
    audioContext = new AudioContext();
    await audioContext.audioWorklet.addModule('./recorder-worklet.js');
    const source = audioContext.createMediaStreamSource(mediaStream);
    recorderNode = new AudioWorkletNode(audioContext, 'crunchymurmur-recorder');
    silentGain = audioContext.createGain();
    silentGain.gain.value = 0;
    recorderNode.port.onmessage = ({ data }) => chunks.push(new Float32Array(data));
    source.connect(recorderNode).connect(silentGain).connect(audioContext.destination);
    chunks = [];
    recording = true;
    elements.record.classList.add('active');
    elements.recordLabel.textContent = i18n.t('stop');
    setStatus('recording', true);
    maximumTimer = window.setTimeout(stopRecording, 60_000);
  } catch {
    mediaStream?.getTracks().forEach((track) => track.stop());
    await audioContext?.close().catch(() => {});
    mediaStream = null;
    audioContext = null;
    recorderNode = null;
    silentGain = null;
    chunks = [];
    recording = false;
    setStatus('microphoneDenied');
  }
}

async function stopRecording() {
  if (!recording) return;
  recording = false;
  window.clearTimeout(maximumTimer);
  elements.record.classList.remove('active');
  elements.recordLabel.textContent = i18n.t('record');
  recorderNode?.disconnect();
  silentGain?.disconnect();
  mediaStream?.getTracks().forEach((track) => track.stop());
  const sampleRate = audioContext?.sampleRate || 48_000;
  await audioContext?.close();
  const samples = mergeSamples(chunks);
  chunks = [];
  if (!samples.length) {
    setStatus('microphoneDenied');
    return;
  }
  setStatus('transcribing', true);
  try {
    const result = await window.chatDemo.transcribeWav({
      ...configuration(),
      wavBytes: encodeWav(samples, sampleRate),
    });
    if (result.outcome === 'speech') {
      const current = elements.message.value.trim();
      elements.message.value = current ? `${current} ${result.text}` : result.text;
      elements.message.focus();
    }
    setStatus('ready');
  } catch (error) {
    console.error('[chat-demo] transcription failed', error);
    setStatus('ready');
    addMessage(i18n.t('transcriptionFailed'), 'assistant');
  }
}

elements.saveSetup.addEventListener('click', saveConfiguration);
elements.record.addEventListener('click', () => {
  if (recording) stopRecording();
  else startRecording();
});
elements.send.addEventListener('click', sendMessage);
elements.message.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendMessage();
  }
});

loadConfiguration();
setStatus('ready');
