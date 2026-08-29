import type { SettingsUpdate } from '../../shared/image-types'
import { dialog } from 'electron'
import { copyFile, stat } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { dataPath, ensureDirectory, readJson, removePath, writeJson } from './storage'

interface StoredSettings {
  baseUrl: string
  model: string
  backgroundImage?: string
}

const BACKGROUND_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp']

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
  const current = await getStoredSettings()
  const updated = { ...settings, backgroundImage: current.backgroundImage }
  await writeJson(settingsPath(), updated)
  return updated
}

export function backgroundImageUrl(settings: StoredSettings): string | undefined {
  return settings.backgroundImage ? `image-deck://background/current?v=${Date.now()}` : undefined
}

export async function pickBackgroundImage(): Promise<StoredSettings> {
  const result = await dialog.showOpenDialog({
    title: '选择窗口背景图片',
    properties: ['openFile'],
    filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
  })
  if (result.canceled || !result.filePaths[0]) return getStoredSettings()

  const source = result.filePaths[0]
  const extension = extname(source).toLowerCase()
  const file = await stat(source)
  if (!BACKGROUND_EXTENSIONS.includes(extension) || file.size > 50 * 1024 * 1024) {
    throw new Error('背景图片格式不支持或超过 50 MB。')
  }

  const directory = dataPath('background')
  await ensureDirectory(directory)
  const path = join(directory, `window${extension}`)
  await copyFile(source, path)
  const current = await getStoredSettings()
  if (current.backgroundImage && current.backgroundImage !== path) {
    await removePath(current.backgroundImage)
  }
  const settings = { ...current, backgroundImage: path }
  await writeJson(settingsPath(), settings)
  return settings
}

export async function clearBackgroundImage(): Promise<StoredSettings> {
  const current = await getStoredSettings()
  if (current.backgroundImage) await removePath(current.backgroundImage)
  const settings = { ...current, backgroundImage: undefined }
  await writeJson(settingsPath(), settings)
  return settings
}
