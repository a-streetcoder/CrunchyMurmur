const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('chatDemo', {
  transcribeWav(request) {
    return ipcRenderer.invoke('chat-demo:transcribe', request);
  },
  diagnostics() {
    return ipcRenderer.invoke('chat-demo:diagnostics');
  },
});
