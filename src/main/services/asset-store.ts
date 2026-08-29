import type { GeneratedAsset, ReferenceImage } from '../../shared/image-types'
import { app, clipboard, dialog, nativeImage, shell } from 'electron'
import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { dataPath, ensureDirectory, removePath } from './storage'

const MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp'
}

const references = new Map<string, { path: string; value: ReferenceImage }>()
const assets = new Map<string, { path: string; value: GeneratedAsset; jobId: string }>()

export function assetUrl(id: string): string {
  return `image-deck://asset/${id}`
}

export async function pickReferenceImages(): Promise<ReferenceImage[]> {
  const result = await dialog.showOpenDialog({
    title: '选择参考图片',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
  })
  if (result.canceled) return []
  if (result.filePaths.length > 16) throw new Error('参考图片最多选择 16 张。')

  const values = await Promise.all(
    result.filePaths.map(async (path) => {
      const file = await stat(path)
      const extension = extname(path).toLowerCase()
      const mimeType = MIME_TYPES[extension]
      if (!mimeType || file.size > 50 * 1024 * 1024) {
        throw new Error(`${basename(path)} 格式不支持或超过 50 MB。`)
      }
      const id = randomUUID()
      const value = { id, name: basename(path), mimeType, size: file.size, url: assetUrl(id) }
      references.set(id, { path, value })
      return value
    })
  )
  return values
}

export function getReferences(
  ids: string[]
): Array<{ path: string; mimeType: string; name: string }> {
  if (ids.length > 16) throw new Error('参考图片最多 16 张。')
  return ids.map((id) => {
    const reference = references.get(id)
    if (!reference) throw new Error('参考图片已失效，请重新选择。')
    return { path: reference.path, mimeType: reference.value.mimeType, name: reference.value.name }
  })
}

export function useAssetAsReference(id: string): ReferenceImage {
  const asset = assets.get(id)
  if (!asset) throw new Error('图片不存在。')
  const referenceId = randomUUID()
  const value: ReferenceImage = {
    id: referenceId,
    name: asset.value.name,
    mimeType: asset.value.mimeType,
    size: asset.value.size,
    url: assetUrl(referenceId)
  }
  references.set(referenceId, { path: asset.path, value })
  return value
}

export async function persistGeneratedAsset(
  jobId: string,
  encoded: string,
  format: 'png' | 'jpeg' | 'webp',
  index: number
): Promise<GeneratedAsset> {
  const directory = dataPath('assets', jobId)
  await ensureDirectory(directory)
  const id = randomUUID()
  const name = `image-${index + 1}.${format === 'jpeg' ? 'jpg' : format}`
  const path = join(directory, name)
  const bytes = Buffer.from(encoded, 'base64')
  if (!bytes.length) throw new Error('接口返回了空图片。')
  await writeFile(path, bytes)
  const value = { id, name, mimeType: `image/${format}`, size: bytes.length, url: assetUrl(id) }
  assets.set(id, { path, value, jobId })
  return value
}

export async function persistGeneratedBytes(
  jobId: string,
  bytes: Uint8Array,
  format: 'png' | 'jpeg' | 'webp',
  index: number
): Promise<GeneratedAsset> {
  return persistGeneratedAsset(jobId, Buffer.from(bytes).toString('base64'), format, index)
}

export function resolveAsset(id: string): { path: string; mimeType: string } | undefined {
  const item = assets.get(id)
  if (item) return { path: item.path, mimeType: item.value.mimeType }
  const reference = references.get(id)
  return reference ? { path: reference.path, mimeType: reference.value.mimeType } : undefined
}

export function restoreAssets(jobId: string, values: GeneratedAsset[]): void {
  for (const value of values) {
    assets.set(value.id, { path: join(dataPath('assets', jobId), value.name), value, jobId })
  }
}

export function storedAssetPath(jobId: string, name: string): string {
  return join(dataPath('assets', jobId), name)
}

export async function saveAsset(id: string): Promise<boolean> {
  const asset = assets.get(id)
  if (!asset) throw new Error('图片不存在。')
  const result = await dialog.showSaveDialog({
    defaultPath: join(app.getPath('pictures'), asset.value.name)
  })
  if (result.canceled || !result.filePath) return false
  await copyFile(asset.path, result.filePath)
  return true
}

export async function saveAssets(ids: string[]): Promise<number> {
  const selected = ids.map((id) => {
    const asset = assets.get(id)
    if (!asset) throw new Error('部分图片不存在。')
    return asset
  })
  if (!selected.length) throw new Error('请选择要导出的图片。')
  const result = await dialog.showOpenDialog({
    title: '选择导出目录',
    defaultPath: app.getPath('pictures'),
    properties: ['openDirectory', 'createDirectory']
  })
  if (result.canceled || !result.filePaths[0]) return 0
  const directory = result.filePaths[0]
  await mkdir(directory, { recursive: true })
  await Promise.all(
    selected.map(async (asset, index) => {
      const extension = extname(asset.value.name)
      const stem = basename(asset.value.name, extension)
      const name =
        selected.length === 1
          ? asset.value.name
          : `${stem}-${asset.jobId.slice(0, 8)}-${index + 1}${extension}`
      await copyFile(asset.path, join(directory, name))
    })
  )
  return selected.length
}

export function copyAsset(id: string): void {
  const asset = assets.get(id)
  if (!asset) throw new Error('图片不存在。')
  const image = nativeImage.createFromPath(asset.path)
  if (image.isEmpty()) throw new Error('图片格式无法复制到剪贴板。')
  clipboard.writeImage(image)
}

export async function showAsset(id: string): Promise<void> {
  const asset = assets.get(id)
  if (!asset) throw new Error('图片不存在。')
  shell.showItemInFolder(asset.path)
}

export async function deleteJobAssets(jobId: string): Promise<void> {
  for (const [id, asset] of assets) {
    if (asset.jobId === jobId) assets.delete(id)
  }
  await removePath(dataPath('assets', jobId))
}

export async function readAsset(id: string): Promise<Buffer> {
  const resolved = resolveAsset(id)
  if (!resolved) throw new Error('图片不存在。')
  return readFile(resolved.path)
}
