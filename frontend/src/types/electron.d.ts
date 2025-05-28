// Type definitions for Electron API exposed through preload.js
interface ElectronAPI {
  // Basic information
  isElectron: boolean;
  platform: string;
  version: string;
  
  // Audio device handling
  getAudioDevices: () => Promise<AudioDevice[]>;
  startAudioRecording: (deviceId: string, options: any) => Promise<string>;
  stopAudioRecording: () => Promise<{success: boolean; sessionId: string; filePath: string}>;
  getAudioLevel: () => Promise<number>;
  getRecordingFilePath: () => Promise<string>;
  getSystemAudio: () => Promise<MediaStream>; // System audio capture for loopback recording
  
  // WebSocket-like functionality
  sendWebSocketMessage: (type: string, data: any) => void;
  addWebSocketMessageHandler: (callback: (message: any) => void) => (() => void);
  getWebSocketStatus: () => Promise<{isConnected: boolean; url: string | null}>;
  recordingCompleted: (callback: (data: {sessionId: string; filePath: string}) => void) => void;
  
  // Floating windows
  createMiniTab: (bounds?: { x: number; y: number; width: number; height: number }) => void;
  createStatusPanel: (bounds?: { x: number; y: number; width: number; height: number }) => void;
  createEnhancedMiniTab: (bounds?: { x: number; y: number; width: number; height: number }) => void;
  updateMiniTabPosition: (bounds: { x: number; y: number; width?: number; height?: number }) => void;
  updateStatusPanelPosition: (bounds: { x: number; y: number; width?: number; height?: number }) => void;
  updateEnhancedMiniTabPosition: (bounds: { x: number; y: number; width?: number; height?: number }) => void;
  closeEnhancedMiniTab: () => void;
  
  // Communication
  send: (channel: string, data?: any) => void;
  on: (channel: string, callback: (...args: any[]) => void) => void;
}

// Extend Window interface
interface Window {
  electron: ElectronAPI;
}
