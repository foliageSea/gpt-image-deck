import type { SettingsUpdate } from '../../shared/image-types'
import { dataPath, readJson, writeJson } from './storage'

interface StoredSettings {
  baseUrl: string
  model: string
}

const defaults: StoredSettings = {
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-image-2'
}

const settingsPath = (): string => dataPath('settings.json')

export async function getStoredSettings(): Promise<StoredSettings> {
  return readJson(settingsPath(), defaults)
}

export function normalizeSettings(input: SettingsUpdate): StoredSettings {
  const url = new URL(input.baseUrl.trim())

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('接口地址必须使用 HTTP 或 HTTPS。')
  }

  const path = url.pathname.replace(/\/+$/, '')
  if (path.endsWith('/v1/images/generations')) {
    url.pathname = path.slice(0, -'/images/generations'.length)
  } else if (!path.endsWith('/v1')) {
    url.pathname = `${path}/v1`.replace(/\/{2,}/g, '/')
  }
  url.search = ''
  url.hash = ''
  const baseUrl = url.toString().replace(/\/$/, '')

  const model = input.model.trim()
  if (!model || model.length > 100) throw new Error('请输入有效的模型名称。')

  return { baseUrl, model }
}

export async function updateStoredSettings(input: SettingsUpdate): Promise<StoredSettings> {
  const settings = normalizeSettings(input)
  await writeJson(settingsPath(), settings)
  return settings
}
