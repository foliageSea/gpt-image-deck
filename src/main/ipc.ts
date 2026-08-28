import type { IpcMainInvokeEvent } from 'electron'
import type { ConnectionTestInput, GenerationRequest, SettingsUpdate } from '../shared/image-types'
import { ipcMain } from 'electron'
import { clearApiKey, hasApiKey, isSecureStorageAvailable, setApiKey } from './services/credentials'
import { clearHistory, deleteHistory, listHistory } from './services/history-store'
import { generateImage, getImageErrorMessage, testConnection } from './services/openai-images'
import { getStoredSettings, updateStoredSettings } from './services/settings-store'
import { pickReferenceImages, saveAsset, showAsset } from './services/asset-store'

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

export function registerIpcHandlers(): void {
  handle('settings:get', async () => {
    const settings = await getStoredSettings()
    return {
      ...settings,
      hasApiKey: await hasApiKey(),
      secureStorageAvailable: isSecureStorageAvailable()
    }
  })

  handle<[SettingsUpdate], unknown>('settings:update', async (_, settings) => {
    const updated = await updateStoredSettings(settings)
    return {
      ...updated,
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
  handle<[GenerationRequest], unknown>('images:generate', async (_, request) => {
    try {
      return { success: true, job: await generateImage(request) }
    } catch (error) {
      return { success: false, message: getImageErrorMessage(error) }
    }
  })
  handle('history:list', async () => listHistory())
  handle<[string], void>('history:delete', async (_, jobId) => {
    await deleteHistory(requireUuid(jobId, '历史记录'))
  })
  handle('history:clear', async () => clearHistory())
  handle<[string], unknown>('asset:save', async (_, assetId) => ({
    success: await saveAsset(requireUuid(assetId, '图片')),
    message: '图片已保存。'
  }))
  handle<[string], void>('asset:show', async (_, assetId) =>
    showAsset(requireUuid(assetId, '图片'))
  )
}
