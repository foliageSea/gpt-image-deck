import type { OperationResult, ProjectImportResult, ProjectState } from '../../shared/image-types'
import { app, dialog } from 'electron'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, mkdtemp, rename, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { tmpdir } from 'node:os'
import { createGunzip, createGzip } from 'node:zlib'
import { pipeline } from 'node:stream/promises'
import { Transform } from 'node:stream'
import { extract, pack } from 'tar-stream'
import { addImportedHistory, clearHistory, listHistory } from './history-store'
import { addImportedProject, deleteProject, getProjectState } from './project-store'
import { dataPath, ensureDirectory, removePath } from './storage'
import { storedAssetPath } from './asset-store'
import {
  archiveAssetPath,
  parseProjectArchiveManifest,
  PROJECT_ARCHIVE_KIND,
  PROJECT_ARCHIVE_VERSION,
  remapImportedProject,
  type ProjectArchiveManifest
} from './project-archive'

const MAX_ARCHIVE_SIZE = 10 * 1024 * 1024 * 1024
const MAX_EXTRACTED_SIZE = 20 * 1024 * 1024 * 1024
const MAX_MANIFEST_SIZE = 5 * 1024 * 1024
const MAX_ENTRIES = 10002

let transferInProgress = false

export function requireProjectTransferIdle(): void {
  if (transferInProgress) throw new Error('项目正在导入或导出，请稍后再试。')
}

function safeFileName(value: string): string {
  const name = Array.from(value)
    .map((character) =>
      character.charCodeAt(0) < 32 || '<>:"/\\|?*'.includes(character) ? '-' : character
    )
    .join('')
    .replace(/[. ]+$/g, '')
    .trim()
  return name || '项目'
}

function addBufferEntry(
  archive: ReturnType<typeof pack>,
  name: string,
  value: Buffer
): Promise<void> {
  return new Promise((resolve, reject) => {
    archive.entry({ name, size: value.length, type: 'file' }, value, (error) =>
      error ? reject(error) : resolve()
    )
  })
}

async function addFileEntry(
  archive: ReturnType<typeof pack>,
  name: string,
  path: string,
  size: number
): Promise<void> {
  const entry = archive.entry({ name, size, type: 'file' })
  await pipeline(createReadStream(path), entry)
}

export async function exportProject(projectId: string): Promise<OperationResult> {
  if (transferInProgress) throw new Error('另一个项目导入或导出操作正在进行。')
  transferInProgress = true
  let temporaryPath: string | undefined
  try {
    const state = await getProjectState()
    const project = state.projects.find((item) => item.id === projectId)
    if (!project) throw new Error('项目不存在。')
    const jobs = await listHistory(projectId)
    for (const job of jobs) {
      for (const asset of job.assets) {
        const file = await stat(storedAssetPath(job.id, asset.name))
        if (!file.isFile() || file.size !== asset.size) {
          throw new Error(`图片 ${asset.name} 缺失或大小不匹配，无法导出。`)
        }
      }
    }

    const result = await dialog.showSaveDialog({
      title: '导出项目',
      defaultPath: join(app.getPath('documents'), `${safeFileName(project.name)}.gptdeck`),
      filters: [{ name: 'GPT Image Deck 项目', extensions: ['gptdeck'] }]
    })
    if (result.canceled || !result.filePath) return { success: false, message: '已取消导出。' }

    const destination = result.filePath.toLocaleLowerCase().endsWith('.gptdeck')
      ? result.filePath
      : `${result.filePath}.gptdeck`
    temporaryPath = `${destination}.tmp`
    const manifest: ProjectArchiveManifest = {
      kind: PROJECT_ARCHIVE_KIND,
      version: PROJECT_ARCHIVE_VERSION,
      appVersion: app.getVersion(),
      exportedAt: new Date().toISOString(),
      project,
      jobs
    }
    const archive = pack()
    const output = pipeline(archive, createGzip({ level: 6 }), createWriteStream(temporaryPath))
    await addBufferEntry(archive, 'manifest.json', Buffer.from(JSON.stringify(manifest), 'utf8'))
    for (const job of jobs) {
      for (const asset of job.assets) {
        await addFileEntry(
          archive,
          archiveAssetPath(job.id, asset.name),
          storedAssetPath(job.id, asset.name),
          asset.size
        )
      }
    }
    archive.finalize()
    await output
    await rename(temporaryPath, destination)
    temporaryPath = undefined
    const assetCount = jobs.reduce((count, job) => count + job.assets.length, 0)
    return {
      success: true,
      message: `项目已导出，包含 ${jobs.length} 条历史记录和 ${assetCount} 张图片。`
    }
  } finally {
    if (temporaryPath) await removePath(temporaryPath)
    transferInProgress = false
  }
}

async function extractProjectArchive(
  archivePath: string,
  stagingPath: string
): Promise<ProjectArchiveManifest> {
  let manifest: ProjectArchiveManifest | undefined
  let expectedAssets = new Map<string, { jobId: string; name: string; size: number }>()
  const seen = new Set<string>()
  let entryCount = 0
  let extractedSize = 0
  const unpack = extract()

  unpack.on('entry', (header, stream, next) => {
    void (async () => {
      if (header.type !== 'file' || !header.name || seen.has(header.name)) {
        throw new Error('项目包包含无效或重复的文件条目。')
      }
      seen.add(header.name)
      entryCount += 1
      extractedSize += header.size
      if (entryCount > MAX_ENTRIES || extractedSize > MAX_EXTRACTED_SIZE) {
        throw new Error('项目包包含过多或过大的文件。')
      }

      if (header.name === 'manifest.json') {
        if (manifest || entryCount !== 1 || header.size > MAX_MANIFEST_SIZE) {
          throw new Error('项目包清单位置或大小无效。')
        }
        const chunks: Buffer[] = []
        let size = 0
        for await (const chunk of stream) {
          const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))
          size += bytes.length
          if (size > MAX_MANIFEST_SIZE) throw new Error('项目包清单过大。')
          chunks.push(bytes)
        }
        try {
          manifest = parseProjectArchiveManifest(JSON.parse(Buffer.concat(chunks).toString('utf8')))
        } catch (error) {
          if (error instanceof SyntaxError) throw new Error('项目包清单不是有效的 JSON。')
          throw error
        }
        expectedAssets = new Map(
          manifest.jobs.flatMap((job) =>
            job.assets.map((asset) => [
              archiveAssetPath(job.id, asset.name),
              { jobId: job.id, name: asset.name, size: asset.size }
            ])
          )
        )
        next()
        return
      }

      if (!manifest) throw new Error('项目包缺少清单或清单不是第一个条目。')
      const expected = expectedAssets.get(header.name)
      if (!expected || header.size !== expected.size) {
        throw new Error(`项目包包含未声明或大小不匹配的图片：${header.name}`)
      }
      const directory = join(stagingPath, expected.jobId)
      await mkdir(directory, { recursive: true })
      let written = 0
      const counter = new Transform({
        transform(chunk, _encoding, callback) {
          written += chunk.length
          callback(null, chunk)
        }
      })
      await pipeline(
        stream,
        counter,
        createWriteStream(join(directory, expected.name), { flags: 'wx' })
      )
      if (written !== expected.size) throw new Error(`图片 ${expected.name} 数据不完整。`)
      next()
    })().catch((error) =>
      unpack.destroy(error instanceof Error ? error : new Error('项目包读取失败。'))
    )
  })

  await pipeline(createReadStream(archivePath), createGunzip(), unpack)
  if (!manifest) throw new Error('项目包缺少清单。')
  for (const path of expectedAssets.keys()) {
    if (!seen.has(path)) throw new Error(`项目包缺少图片：${basename(path)}`)
  }
  if (seen.size !== expectedAssets.size + 1) throw new Error('项目包包含未声明的文件。')
  return manifest
}

async function commitImportedProject(
  manifest: ProjectArchiveManifest,
  stagingPath: string,
  state: ProjectState
): Promise<ProjectImportResult> {
  const remapped = remapImportedProject(
    manifest,
    state.projects.map((project) => project.name)
  )
  const movedJobIds: string[] = []
  let historyAdded = false
  let projectAdded = false
  try {
    await ensureDirectory(dataPath('assets'))
    for (const job of manifest.jobs) {
      const newJobId = remapped.oldJobIds.get(job.id)
      if (!newJobId) throw new Error('无法映射导入图片目录。')
      if (!job.assets.length) continue
      await rename(join(stagingPath, job.id), dataPath('assets', newJobId))
      movedJobIds.push(newJobId)
    }
    await addImportedHistory(remapped.jobs)
    historyAdded = true
    const nextState = await addImportedProject(remapped.project)
    projectAdded = true
    const assetCount = remapped.jobs.reduce((count, job) => count + job.assets.length, 0)
    return {
      success: true,
      message: `项目“${remapped.project.name}”已导入。`,
      state: nextState,
      project: remapped.project,
      jobCount: remapped.jobs.length,
      assetCount
    }
  } catch (error) {
    if (projectAdded) await deleteProject(remapped.project.id).catch(() => undefined)
    if (historyAdded) await clearHistory(remapped.project.id).catch(() => undefined)
    if (!historyAdded) {
      await Promise.allSettled(movedJobIds.map((jobId) => removePath(dataPath('assets', jobId))))
    }
    throw error
  }
}

export async function importProject(): Promise<ProjectImportResult> {
  if (transferInProgress) throw new Error('另一个项目导入或导出操作正在进行。')
  transferInProgress = true
  let stagingRoot: string | undefined
  try {
    const result = await dialog.showOpenDialog({
      title: '导入项目',
      properties: ['openFile'],
      filters: [{ name: 'GPT Image Deck 项目', extensions: ['gptdeck'] }]
    })
    if (result.canceled || !result.filePaths[0]) return { success: false, message: '已取消导入。' }
    const archivePath = result.filePaths[0]
    const archive = await stat(archivePath)
    if (!archive.isFile() || archive.size < 1 || archive.size > MAX_ARCHIVE_SIZE) {
      throw new Error('项目包为空或超过 10 GB。')
    }
    stagingRoot = await mkdtemp(join(tmpdir(), 'gpt-image-deck-import-'))
    const assetsStagingPath = join(stagingRoot, 'assets')
    await mkdir(assetsStagingPath)
    const manifest = await extractProjectArchive(archivePath, assetsStagingPath)
    return await commitImportedProject(manifest, assetsStagingPath, await getProjectState())
  } finally {
    if (stagingRoot) await removePath(stagingRoot)
    transferInProgress = false
  }
}
