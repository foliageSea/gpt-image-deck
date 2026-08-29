import type { IpcMainInvokeEvent } from 'electron'
import type {
  ConnectionTestInput,
  GenerationRequest,
  PromptTemplateInput,
  SettingsUpdate
} from '../shared/image-types'
import { BrowserWindow, ipcMain, Notification } from 'electron'
import { clearApiKey, hasApiKey, isSecureStorageAvailable, setApiKey } from './services/credentials'
import {
  clearHistory,
  deleteHistory,
  listHistory,
  setAssetFavorite
} from './services/history-store'
import { generateImage, getImageErrorMessage, testConnection } from './services/openai-images'
import {
  createProject,
  deleteProject,
  getProjectState,
  selectProject
} from './services/project-store'
import { createPrompt, deletePrompt, listPrompts, updatePrompt } from './services/prompt-store'
import {
  exportProject,
  importProject,
  requireProjectTransferIdle
} from './services/project-transfer'
import {
  backgroundImageUrl,
  clearBackgroundImage,
  getStoredSettings,
  pickBackgroundImage,
  updateStoredSettings
} from './services/settings-store'
import {
  copyAsset,
  pickReferenceImages,
  saveAsset,
  saveAssets,
  showAsset,
  useAssetAsReference
} from './services/asset-store'

const generationControllers = new Map<string, { controller: AbortController; senderId: number }>()

function validateSender(event: IpcMainInvokeEvent): void {
  const url = event.senderFrame?.url
  if (!url) throw new Error('无法验证应用请求来源。')
  const parsed = new URL(url)
  const localDevelopment =
    parsed.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)
  if (parsed.protocol !== 'file:' && !localDevelopment) {
    throw new Error('拒绝未授权的应用请求。')
  }
}

function handle<T extends unknown[], R>(
  channel: string,
  listener: (event: IpcMainInvokeEvent, ...args: T) => Promise<R>
): void {
  ipcMain.handle(channel, async (event, ...args: T) => {
    validateSender(event)
    return listener(event, ...args)
  })
}

function requireUuid(value: unknown, label: string): string {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  ) {
    throw new Error(`${label} ID 无效。`)
  }
  return value
}

function getSenderWindow(event: IpcMainInvokeEvent): BrowserWindow {
  const window = BrowserWindow.fromWebContents(event.sender)
  if (!window || window.isDestroyed()) throw new Error('应用窗口不可用。')
  return window
}

function notifyGenerationComplete(event: IpcMainInvokeEvent, imageCount: number): void {
  if (!Notification.isSupported()) return

  try {
    const notification = new Notification({
      title: '图片生成完成',
      body: `已生成 ${imageCount} 张图片并保存到本地历史。`
    })
    const window = BrowserWindow.fromWebContents(event.sender)
    notification.on('click', () => {
      if (!window || window.isDestroyed()) return
      if (window.isMinimized()) window.restore()
      window.show()
      window.focus()
    })
    notification.show()
  } catch (error) {
    console.error('Failed to show generation notification:', error)
  }
}

export function registerIpcHandlers(): void {
  handle('window:minimize', async (event) => {
    getSenderWindow(event).minimize()
  })
  handle('window:toggle-maximize', async (event) => {
    const window = getSenderWindow(event)
    window.isMaximized() ? window.unmaximize() : window.maximize()
    return window.isMaximized()
  })
  handle('window:close', async (event) => {
    getSenderWindow(event).close()
  })
  handle('window:is-maximized', async (event) => getSenderWindow(event).isMaximized())

  handle('settings:get', async () => {
    const settings = await getStoredSettings()
    return {
      baseUrl: settings.baseUrl,
      model: settings.model,
      backgroundImageUrl: backgroundImageUrl(settings),
      hasApiKey: await hasApiKey(),
      secureStorageAvailable: isSecureStorageAvailable()
    }
  })

  handle<[SettingsUpdate], unknown>('settings:update', async (_, settings) => {
    const updated = await updateStoredSettings(settings)
    return {
      baseUrl: updated.baseUrl,
      model: updated.model,
      backgroundImageUrl: backgroundImageUrl(updated),
      hasApiKey: await hasApiKey(),
      secureStorageAvailable: isSecureStorageAvailable()
    }
  })
  handle('settings:pick-background', async () => {
    const settings = await pickBackgroundImage()
    return {
      baseUrl: settings.baseUrl,
      model: settings.model,
      backgroundImageUrl: backgroundImageUrl(settings),
      hasApiKey: await hasApiKey(),
      secureStorageAvailable: isSecureStorageAvailable()
    }
  })
  handle('settings:clear-background', async () => {
    const settings = await clearBackgroundImage()
    return {
      baseUrl: settings.baseUrl,
      model: settings.model,
      backgroundImageUrl: backgroundImageUrl(settings),
      hasApiKey: await hasApiKey(),
      secureStorageAvailable: isSecureStorageAvailable()
    }
  })

  handle<[string], unknown>('credentials:set', async (_, apiKey) => {
    if (typeof apiKey !== 'string') throw new Error('API Key 格式无效。')
    const { persisted } = await setApiKey(apiKey)
    return {
      success: true,
      message: persisted
        ? 'API Key 已保存到系统安全存储。'
        : '安全存储不可用，API Key 仅在本次会话中使用。'
    }
  })
  handle('credentials:clear', async () => clearApiKey())
  handle<[ConnectionTestInput], unknown>('connection:test', async (_, input) => {
    try {
      await testConnection(input)
      return { success: true, message: '连接成功。' }
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : '连接失败。' }
    }
  })

  handle('references:pick', async () => pickReferenceImages())
  handle<[string], unknown>('references:from-asset', async (_, assetId) =>
    useAssetAsReference(requireUuid(assetId, '图片'))
  )
  handle<[GenerationRequest, string?], unknown>(
    'images:generate',
    async (event, request, requestId) => {
      requireProjectTransferIdle()
      const id = requestId === undefined ? undefined : requireUuid(requestId, '生成请求')
      const controller = new AbortController()
      if (id) generationControllers.set(id, { controller, senderId: event.sender.id })
      try {
        const projectId = requireUuid(request.projectId, '项目')
        const projects = await getProjectState()
        if (!projects.projects.some((project) => project.id === projectId)) {
          throw new Error('项目不存在。')
        }
        const job = await generateImage(request, controller.signal)
        notifyGenerationComplete(event, job.assets.length)
        return { success: true, job }
      } catch (error) {
        return { success: false, message: getImageErrorMessage(error) }
      } finally {
        if (id) generationControllers.delete(id)
      }
    }
  )
  handle<[string], void>('images:cancel', async (event, requestId) => {
    const id = requireUuid(requestId, '生成请求')
    const generation = generationControllers.get(id)
    if (generation?.senderId === event.sender.id) generation.controller.abort()
  })
  handle('projects:get', async () => getProjectState())
  handle<[string], unknown>('projects:create', async (_, name) => {
    requireProjectTransferIdle()
    if (typeof name !== 'string') throw new Error('项目名称无效。')
    return createProject(name)
  })
  handle<[string], unknown>('projects:select', async (_, projectId) => {
    requireProjectTransferIdle()
    return selectProject(requireUuid(projectId, '项目'))
  })
  handle<[string], unknown>('projects:delete', async (_, projectId) => {
    requireProjectTransferIdle()
    const id = requireUuid(projectId, '项目')
    await clearHistory(id)
    return deleteProject(id)
  })
  handle<[string], unknown>('projects:export', async (_, projectId) =>
    exportProject(requireUuid(projectId, '项目'))
  )
  handle('projects:import', async () => importProject())
  handle('prompts:list', async () => listPrompts())
  handle<[PromptTemplateInput], unknown>('prompts:create', async (_, input) => createPrompt(input))
  handle<[string, PromptTemplateInput], unknown>('prompts:update', async (_, promptId, input) =>
    updatePrompt(requireUuid(promptId, '提示词'), input)
  )
  handle<[string], unknown>('prompts:delete', async (_, promptId) =>
    deletePrompt(requireUuid(promptId, '提示词'))
  )
  handle<[string], unknown>('history:list', async (_, projectId) =>
    listHistory(requireUuid(projectId, '项目'))
  )
  handle<[string], void>('history:delete', async (_, jobId) => {
    requireProjectTransferIdle()
    await deleteHistory(requireUuid(jobId, '历史记录'))
  })
  handle<[string], void>('history:clear', async (_, projectId) => {
    requireProjectTransferIdle()
    await clearHistory(requireUuid(projectId, '项目'))
  })
  handle<[string, boolean], unknown>('history:set-asset-favorite', async (_, assetId, favorite) => {
    requireProjectTransferIdle()
    if (typeof favorite !== 'boolean') throw new Error('收藏状态无效。')
    return setAssetFavorite(requireUuid(assetId, '图片'), favorite)
  })
  handle<[string], unknown>('asset:save', async (_, assetId) => ({
    success: await saveAsset(requireUuid(assetId, '图片')),
    message: '图片已保存。'
  }))
  handle<[string[]], unknown>('asset:save-many', async (_, assetIds) => {
    if (!Array.isArray(assetIds) || assetIds.length > 100) throw new Error('图片列表无效。')
    const count = await saveAssets(assetIds.map((id) => requireUuid(id, '图片')))
    return {
      success: count > 0,
      message: count > 0 ? `已导出 ${count} 张图片。` : '已取消导出。'
    }
  })
  handle<[string], unknown>('asset:copy', async (_, assetId) => {
    copyAsset(requireUuid(assetId, '图片'))
    return { success: true, message: '图片已复制到剪贴板。' }
  })
  handle<[string], void>('asset:show', async (_, assetId) =>
    showAsset(requireUuid(assetId, '图片'))
  )
}
