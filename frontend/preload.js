const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods to the renderer process
contextBridge.exposeInMainWorld(
  'electron', {
    // Basic information
    isElectron: true,
    platform: process.platform,
    version: process.versions.electron,
    
    // Audio device handling
    getAudioDevices: () => ipcRenderer.invoke('get-audio-devices'),
    startAudioRecording: (deviceId, options) => ipcRenderer.invoke('start-audio-recording', deviceId, options),
    stopAudioRecording: () => ipcRenderer.invoke('stop-audio-recording'),
    getAudioLevel: () => ipcRenderer.invoke('get-audio-level'),
    getRecordingFilePath: () => ipcRenderer.invoke('get-recording-file-path'),
    
    // WebSocket-like functionality
    sendWebSocketMessage: (type, data) => {
      // This will be handled by the main process
      ipcRenderer.send('websocket-message-send', { type, data });
    },
    addWebSocketMessageHandler: (callback) => {
      const handler = (event, message) => callback(message);
      ipcRenderer.on('websocket-message', handler);
      return () => ipcRenderer.removeListener('websocket-message', handler);
    },
    getWebSocketStatus: () => ipcRenderer.invoke('get-websocket-status'),
    recordingCompleted: (callback) => {
      ipcRenderer.on('recording-completed', (event, data) => callback(data));
    },
    
    
    // Floating windows
    createMiniTab: (bounds) => ipcRenderer.send('create-mini-tab', bounds),
    createStatusPanel: (bounds) => ipcRenderer.send('create-status-panel', bounds),
    createEnhancedMiniTab: (bounds) => ipcRenderer.send('create-enhanced-mini-tab', bounds),
    updateMiniTabPosition: (bounds) => ipcRenderer.send('update-mini-tab-position', bounds),
    updateStatusPanelPosition: (bounds) => ipcRenderer.send('update-status-panel-position', bounds),
    updateEnhancedMiniTabPosition: (bounds) => ipcRenderer.send('update-enhanced-mini-tab-position', bounds),
    closeEnhancedMiniTab: () => ipcRenderer.send('close-enhanced-mini-tab'),
    
    // Send events to main process
    send: (channel, data) => {
      // Only allow specific channels for security
      const validChannels = ['show-main-window', 'hide-main-window'];
      if (validChannels.includes(channel)) {
        ipcRenderer.send(channel, data);
      }
    },
    
    // Receive events from main process
    on: (channel, func) => {
      const validChannels = [
        'toggle-mini-tab', 
        'toggle-status-panel', 
        'toggle-enhanced-mini-tab', 
        'global-shortcut', 
        'audio-level-update', 
        'recording-status-update', 
        'websocket-message', 
        'recording-completed'
      ];
      if (validChannels.includes(channel)) {
        ipcRenderer.on(channel, (event, ...args) => func(...args));
      }
    }
  }
);
