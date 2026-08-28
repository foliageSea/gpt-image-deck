import type { ImageDeckApi } from '../shared/image-types'
import { contextBridge, ipcRenderer } from 'electron'

// Custom APIs for renderer
const api: ImageDeckApi = {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (settings) => ipcRenderer.invoke('settings:update', settings),
  setApiKey: (apiKey) => ipcRenderer.invoke('credentials:set', apiKey),
  clearApiKey: () => ipcRenderer.invoke('credentials:clear'),
  testConnection: (input) => ipcRenderer.invoke('connection:test', input),
  pickReferenceImages: () => ipcRenderer.invoke('references:pick'),
  useAssetAsReference: (assetId) => ipcRenderer.invoke('references:from-asset', assetId),
  generate: (request) => ipcRenderer.invoke('images:generate', request),
  getProjects: () => ipcRenderer.invoke('projects:get'),
  createProject: (name) => ipcRenderer.invoke('projects:create', name),
  selectProject: (projectId) => ipcRenderer.invoke('projects:select', projectId),
  deleteProject: (projectId) => ipcRenderer.invoke('projects:delete', projectId),
  listHistory: (projectId) => ipcRenderer.invoke('history:list', projectId),
  deleteHistory: (jobId) => ipcRenderer.invoke('history:delete', jobId),
  clearHistory: (projectId) => ipcRenderer.invoke('history:clear', projectId),
  setAssetFavorite: (assetId, favorite) =>
    ipcRenderer.invoke('history:set-asset-favorite', assetId, favorite),
  saveAsset: (assetId) => ipcRenderer.invoke('asset:save', assetId),
  saveAssets: (assetIds) => ipcRenderer.invoke('asset:save-many', assetIds),
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
