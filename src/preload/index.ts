import type { ImageDeckApi } from '../shared/image-types'
import { contextBridge, ipcRenderer } from 'electron'

// Custom APIs for renderer
const api: ImageDeckApi = {
  windowControls: {
    platform: process.platform as ImageDeckApi['windowControls']['platform'],
    minimize: () => ipcRenderer.invoke('window:minimize'),
    toggleMaximize: () => ipcRenderer.invoke('window:toggle-maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
    onMaximizedChange: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, maximized: boolean): void => {
        callback(maximized)
      }
      ipcRenderer.on('window:maximized-change', listener)
      return () => ipcRenderer.removeListener('window:maximized-change', listener)
    }
  },
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (settings) => ipcRenderer.invoke('settings:update', settings),
  pickBackgroundImage: () => ipcRenderer.invoke('settings:pick-background'),
  clearBackgroundImage: () => ipcRenderer.invoke('settings:clear-background'),
  setApiKey: (apiKey) => ipcRenderer.invoke('credentials:set', apiKey),
  clearApiKey: () => ipcRenderer.invoke('credentials:clear'),
  testConnection: (input) => ipcRenderer.invoke('connection:test', input),
  pickReferenceImages: () => ipcRenderer.invoke('references:pick'),
  useAssetAsReference: (assetId) => ipcRenderer.invoke('references:from-asset', assetId),
  generate: (request, requestId) => ipcRenderer.invoke('images:generate', request, requestId),
  cancelGeneration: (requestId) => ipcRenderer.invoke('images:cancel', requestId),
  getProjects: () => ipcRenderer.invoke('projects:get'),
  createProject: (name) => ipcRenderer.invoke('projects:create', name),
  selectProject: (projectId) => ipcRenderer.invoke('projects:select', projectId),
  deleteProject: (projectId) => ipcRenderer.invoke('projects:delete', projectId),
  listPrompts: () => ipcRenderer.invoke('prompts:list'),
  createPrompt: (input) => ipcRenderer.invoke('prompts:create', input),
  updatePrompt: (id, input) => ipcRenderer.invoke('prompts:update', id, input),
  deletePrompt: (id) => ipcRenderer.invoke('prompts:delete', id),
  listHistory: (projectId) => ipcRenderer.invoke('history:list', projectId),
  deleteHistory: (jobId) => ipcRenderer.invoke('history:delete', jobId),
  clearHistory: (projectId) => ipcRenderer.invoke('history:clear', projectId),
  setAssetFavorite: (assetId, favorite) =>
    ipcRenderer.invoke('history:set-asset-favorite', assetId, favorite),
  saveAsset: (assetId) => ipcRenderer.invoke('asset:save', assetId),
  saveAssets: (assetIds) => ipcRenderer.invoke('asset:save-many', assetIds),
  copyAsset: (assetId) => ipcRenderer.invoke('asset:copy', assetId),
  showAsset: (assetId) => ipcRenderer.invoke('asset:show', assetId)
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('imageDeck', api)
  } catch (error) {
    console.error(error)
  }
} else {
  Object.assign(window, { imageDeck: api })
}
