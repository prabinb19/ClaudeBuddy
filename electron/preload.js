const { contextBridge, ipcRenderer } = require('electron');

/**
 * Expose a secure API to the renderer process
 *
 * This preload script runs in a context that has access to both
 * the renderer (DOM/web APIs) and a limited subset of Node.js APIs.
 * It safely exposes specific IPC channels to the renderer.
 */
contextBridge.exposeInMainWorld('electronAPI', {
  /**
   * Hide the window (minimize to tray)
   */
  hideWindow: () => ipcRenderer.invoke('hide-window'),

  /**
   * Quit the application entirely
   */
  quitApp: () => ipcRenderer.invoke('quit-app'),

  /**
   * Get the application version
   */
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  /**
   * Check if running in Electron
   */
  isElectron: true,

  /**
   * Platform detection
   */
  platform: process.platform,
});

/**
 * Expose environment info
 */
contextBridge.exposeInMainWorld('appInfo', {
  isElectron: true,
  platform: process.platform,
  isDev: process.env.NODE_ENV === 'development',
});
