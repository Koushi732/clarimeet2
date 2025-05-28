/**
 * Bridge for communicating with Electron
 * Provides fallbacks for when running in browser mode
 */

// Check if running in Electron
export const isElectron = (): boolean => {
  // Use the electron interface from our type declarations - window.electron is injected by preload.js
  return window.electron?.isElectron === true;
};

// Get current platform
export const getPlatform = (): string => {
  // Use the electron interface from our type declarations
  return isElectron() ? window.electron.platform : 'browser';
};

// Show main window
export const showMainWindow = (): void => {
  // Use the electron interface from our type declarations
  if (isElectron()) window.electron.send('show-main-window');
};

// Hide main window
export const hideMainWindow = (): void => {
  // Use the electron interface from our type declarations
  if (isElectron()) window.electron.send('hide-main-window');
};

// Create system-wide floating mini tab
export const createMiniTab = (bounds?: { x: number; y: number; width: number; height: number }): void => {
  // Use the electron interface from our type declarations
  if (isElectron()) window.electron.createMiniTab(bounds);
};

// Create system-wide floating status panel
export const createStatusPanel = (bounds?: { x: number; y: number; width: number; height: number }): void => {
  // Use the electron interface from our type declarations
  if (isElectron()) window.electron.createStatusPanel(bounds);
};

// Create system-wide enhanced floating mini tab
export const createEnhancedMiniTab = (bounds?: { x: number; y: number; width: number; height: number }): void => {
  // Use the electron interface from our type declarations
  if (isElectron()) window.electron.createEnhancedMiniTab(bounds);
};

// Update mini tab position
export const updateMiniTabPosition = (bounds: { x: number; y: number; width: number; height: number }): void => {
  // Use the electron interface from our type declarations
  if (isElectron()) window.electron.updateMiniTabPosition(bounds);
};

// Update status panel position
export const updateStatusPanelPosition = (bounds: { x: number; y: number; width: number; height: number }): void => {
  // Use the electron interface from our type declarations
  if (isElectron()) window.electron.updateStatusPanelPosition(bounds);
};

// Update enhanced mini tab position
export const updateEnhancedMiniTabPosition = (bounds: { x: number; y: number; width: number; height: number }): void => {
  // Use the electron interface from our type declarations
  if (isElectron()) window.electron.updateEnhancedMiniTabPosition(bounds);
};

// Close enhanced mini tab
export const closeEnhancedMiniTab = (): void => {
  // Use the electron interface from our type declarations
  if (isElectron()) window.electron.closeEnhancedMiniTab();
};

// Listen for toggle mini tab event
export const onToggleMiniTab = (callback: () => void): (() => void) => {
  if (!isElectron()) return () => {};
  
  // Use the electron interface from our type declarations
  window.electron.on('toggle-mini-tab', callback);
  
  return () => {
    // No need for removeAllListeners as we don't have direct access
    // We'd need to handle this in the main process
  };
};

// Listen for toggle status panel event
export const onToggleStatusPanel = (callback: () => void): (() => void) => {
  if (!isElectron()) return () => {};
  
  // Use the electron interface from our type declarations
  window.electron.on('toggle-status-panel', callback);
  
  return () => {
    // No need for removeAllListeners as we don't have direct access
    // We'd need to handle this in the main process
  };
};

// Listen for toggle enhanced mini tab event
export const onToggleEnhancedMiniTab = (callback: () => void): (() => void) => {
  if (!isElectron()) return () => {};
  
  // Use the electron interface from our type declarations
  window.electron.on('toggle-enhanced-mini-tab', callback);
  
  return () => {
    // No need for removeAllListeners as we don't have direct access
    // We'd need to handle this in the main process
  };
};

// Listen for global shortcuts
export const onGlobalShortcut = (callback: (command: string) => void): (() => void) => {
  if (!isElectron()) return () => {};
  
  // Use the electron interface from our type declarations
  window.electron.on('global-shortcut', callback);
  
  return () => {
    // No need for removeAllListeners as we don't have direct access
    // We'd need to handle this in the main process
  };
};
