/**
 * Outdoors — Electron Preload Script
 *
 * Exposes IPC bridge to the setup wizard renderer.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Dependency installation
  installNodeDeps: () => ipcRenderer.invoke('install-node-deps'),
  installClaudeCLI: () => ipcRenderer.invoke('install-claude-cli'),
  checkClaudeInstalled: () => ipcRenderer.invoke('check-claude-installed'),

  // Claude authentication
  checkClaudeAuth: () => ipcRenderer.invoke('check-claude-auth'),
  startClaudeAuth: () => ipcRenderer.invoke('start-claude-auth'),
  cancelAuthPoll: () => ipcRenderer.invoke('cancel-auth-poll'),

  // Browser setup
  detectBrowser: () => ipcRenderer.invoke('detect-browser'),
  createAutomationProfile: (data) => ipcRenderer.invoke('create-automation-profile', data),
  launchAutomationChrome: (exePath) => ipcRenderer.invoke('launch-automation-chrome', exePath),
  checkBrowserAuth: () => ipcRenderer.invoke('check-browser-auth'),

  // Telegram setup
  saveTelegramToken: (token) => ipcRenderer.invoke('save-telegram-token', token),
  detectTelegramChatId: (token) => ipcRenderer.invoke('detect-telegram-chat-id', token),

  // Backend
  startBackend: () => ipcRenderer.invoke('start-backend'),
  getBackendUrl: () => ipcRenderer.invoke('get-backend-url'),

  // Setup lifecycle
  completeSetup: () => ipcRenderer.invoke('complete-setup'),
  closeWindow: () => ipcRenderer.invoke('close-window'),
});
