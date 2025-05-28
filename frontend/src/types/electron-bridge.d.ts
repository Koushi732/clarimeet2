// Type definitions for Electron bridge functionality

interface ElectronBridge {
  isElectron: boolean;
  platform: string;
  send: (channel: string, ...args: any[]) => void;
  on: (channel: string, callback: (...args: any[]) => void) => void;
  createMiniTab: (bounds?: { x: number; y: number; width: number; height: number }) => void;
  createEnhancedMiniTab: (bounds?: { x: number; y: number; width: number; height: number }) => void;
  createStatusPanel: (bounds?: { x: number; y: number; width: number; height: number }) => void;
  updateMiniTabPosition: (bounds: { x: number; y: number; width: number; height: number }) => void;
  updateStatusPanelPosition: (bounds: { x: number; y: number; width: number; height: number }) => void;
  updateEnhancedMiniTabPosition: (bounds: { x: number; y: number; width: number; height: number }) => void;
  closeEnhancedMiniTab: () => void;
}

declare global {
  interface Window {
    electron?: ElectronBridge;
  }
}
