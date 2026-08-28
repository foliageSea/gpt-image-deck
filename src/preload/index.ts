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
  generate: (request) => ipcRenderer.invoke('images:generate', request),
  listHistory: () => ipcRenderer.invoke('history:list'),
  deleteHistory: (jobId) => ipcRenderer.invoke('history:delete', jobId),
  clearHistory: () => ipcRenderer.invoke('history:clear'),
  saveAsset: (assetId) => ipcRenderer.invoke('asset:save', assetId),
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
