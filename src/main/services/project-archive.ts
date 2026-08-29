import type { GenerationJob, Project } from '../../shared/image-types'
import { randomUUID } from 'node:crypto'

export const PROJECT_ARCHIVE_KIND = 'gpt-image-deck-project'
export const PROJECT_ARCHIVE_VERSION = 1

export interface ProjectArchiveManifest {
  kind: typeof PROJECT_ARCHIVE_KIND
  version: typeof PROJECT_ARCHIVE_VERSION
  appVersion: string
  exportedAt: string
  project: Project
  jobs: GenerationJob[]
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SAFE_ASSET_NAME = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,199}$/
const STATUSES = new Set(['completed', 'partial', 'failed'])
const QUALITIES = new Set(['auto', 'low', 'medium', 'high'])
const FORMATS = new Set(['png', 'jpeg', 'webp'])
const BACKGROUNDS = new Set(['auto', 'opaque', 'transparent'])
const FIDELITIES = new Set(['low', 'high'])
const MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requireString(value: unknown, label: string, maxLength = 10000): string {
  if (typeof value !== 'string' || !value || value.length > maxLength) {
    throw new Error(`${label}无效。`)
  }
  return value
}

function requireUuid(value: unknown, label: string): string {
  const id = requireString(value, label, 36)
  if (!UUID_PATTERN.test(id)) throw new Error(`${label}无效。`)
  return id
}

function requireDate(value: unknown, label: string): string {
  const date = requireString(value, label, 50)
  if (!Number.isFinite(Date.parse(date))) throw new Error(`${label}无效。`)
  return date
}

function optionalString(value: unknown, label: string, maxLength: number): string | undefined {
  return value === undefined ? undefined : requireString(value, label, maxLength)
}

function parseProject(value: unknown): Project {
  if (!isRecord(value)) throw new Error('项目元数据无效。')
  const name = requireString(value.name, '项目名称', 50).trim()
  if (!name) throw new Error('项目名称无效。')
  return {
    id: requireUuid(value.id, '项目 ID'),
    name,
    createdAt: requireDate(value.createdAt, '项目创建时间')
  }
}

function parseJob(value: unknown, projectId: string): GenerationJob {
  if (!isRecord(value) || !isRecord(value.request) || !Array.isArray(value.assets)) {
    throw new Error('历史记录结构无效。')
  }
  if (value.assets.length > 100) throw new Error('单条历史记录包含过多图片。')
  const jobId = requireUuid(value.id, '历史记录 ID')
  if (requireUuid(value.projectId, '历史记录项目 ID') !== projectId) {
    throw new Error('历史记录不属于归档项目。')
  }
  const status = requireString(value.status, '历史状态', 20)
  const quality = requireString(value.request.quality, '图片质量', 20)
  const format = requireString(value.request.format, '图片格式', 20)
  const background = requireString(value.request.background, '图片背景', 20)
  const inputFidelity = requireString(value.request.inputFidelity, '输入保真度', 20)
  if (!STATUSES.has(status) || !QUALITIES.has(quality) || !FORMATS.has(format)) {
    throw new Error('历史记录包含不支持的生成参数。')
  }
  if (!BACKGROUNDS.has(background) || !FIDELITIES.has(inputFidelity)) {
    throw new Error('历史记录包含不支持的生成参数。')
  }
  const n = value.request.n
  const compression = value.request.compression
  const referenceCount = value.request.referenceCount
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > 100) {
    throw new Error('生成数量无效。')
  }
  if (
    typeof compression !== 'number' ||
    !Number.isInteger(compression) ||
    compression < 0 ||
    compression > 100
  ) {
    throw new Error('压缩质量无效。')
  }
  if (
    typeof referenceCount !== 'number' ||
    !Number.isInteger(referenceCount) ||
    referenceCount < 0 ||
    referenceCount > 16
  ) {
    throw new Error('参考图片数量无效。')
  }
  const assets = value.assets.map((asset, index) => {
    if (!isRecord(asset)) throw new Error('图片元数据无效。')
    const id = requireUuid(asset.id, `第 ${index + 1} 张图片 ID`)
    const name = requireString(asset.name, '图片文件名', 200)
    const mimeType = requireString(asset.mimeType, '图片 MIME 类型', 30)
    if (!SAFE_ASSET_NAME.test(name) || !MIME_TYPES.has(mimeType)) {
      throw new Error('图片文件名或格式无效。')
    }
    if (!Number.isSafeInteger(asset.size) || (asset.size as number) < 1) {
      throw new Error('图片大小无效。')
    }
    if (asset.favorite !== undefined && typeof asset.favorite !== 'boolean') {
      throw new Error('图片收藏状态无效。')
    }
    return {
      id,
      name,
      mimeType,
      size: asset.size as number,
      url: `image-deck://asset/${id}`,
      ...(asset.favorite === undefined ? {} : { favorite: asset.favorite })
    }
  })
  let usage: GenerationJob['usage']
  if (value.usage !== undefined) {
    if (!isRecord(value.usage)) throw new Error('Token 用量无效。')
    const parsedUsage: NonNullable<GenerationJob['usage']> = {}
    for (const key of ['totalTokens', 'inputTokens', 'outputTokens'] as const) {
      const amount = value.usage[key]
      if (amount !== undefined) {
        if (!Number.isSafeInteger(amount) || (amount as number) < 0) {
          throw new Error('Token 用量无效。')
        }
        parsedUsage[key] = amount as number
      }
    }
    usage = parsedUsage
  }
  return {
    id: jobId,
    projectId,
    createdAt: requireDate(value.createdAt, '历史创建时间'),
    status: status as GenerationJob['status'],
    prompt: requireString(value.prompt, '提示词', 100000),
    parentJobId:
      value.parentJobId === undefined ? undefined : requireUuid(value.parentJobId, '父历史记录 ID'),
    sourceAssetId:
      value.sourceAssetId === undefined
        ? undefined
        : requireUuid(value.sourceAssetId, '来源图片 ID'),
    request: {
      prompt: requireString(value.request.prompt, '请求提示词', 100000),
      n,
      size: requireString(value.request.size, '图片尺寸', 50),
      quality: quality as GenerationJob['request']['quality'],
      format: format as GenerationJob['request']['format'],
      compression,
      background: background as GenerationJob['request']['background'],
      inputFidelity: inputFidelity as GenerationJob['request']['inputFidelity'],
      referenceCount
    },
    assets,
    usage,
    error: optionalString(value.error, '错误信息', 100000)
  }
}

export function parseProjectArchiveManifest(value: unknown): ProjectArchiveManifest {
  if (!isRecord(value)) throw new Error('项目包清单无效。')
  if (value.kind !== PROJECT_ARCHIVE_KIND) throw new Error('这不是有效的项目包。')
  if (value.version !== PROJECT_ARCHIVE_VERSION) {
    throw new Error(`不支持此项目包版本（${String(value.version)}）。`)
  }
  if (!Array.isArray(value.jobs) || value.jobs.length > 1000) {
    throw new Error('项目包历史记录数量无效。')
  }
  const project = parseProject(value.project)
  const jobs = value.jobs.map((job) => parseJob(job, project.id))
  const jobIds = new Set(jobs.map((job) => job.id))
  const assetIds = new Set(jobs.flatMap((job) => job.assets.map((asset) => asset.id)))
  if (jobIds.size !== jobs.length || assetIds.size !== jobs.flatMap((job) => job.assets).length) {
    throw new Error('项目包包含重复 ID。')
  }
  for (const job of jobs) {
    if (job.parentJobId && !jobIds.has(job.parentJobId)) {
      throw new Error('项目包包含无效的父历史记录引用。')
    }
    if (job.sourceAssetId && !assetIds.has(job.sourceAssetId)) {
      throw new Error('项目包包含无效的来源图片引用。')
    }
  }
  return {
    kind: PROJECT_ARCHIVE_KIND,
    version: PROJECT_ARCHIVE_VERSION,
    appVersion: requireString(value.appVersion, '应用版本', 50),
    exportedAt: requireDate(value.exportedAt, '导出时间'),
    project,
    jobs
  }
}

export function uniqueImportedProjectName(name: string, existingNames: string[]): string {
  const used = new Set(existingNames.map((value) => value.toLocaleLowerCase()))
  const base = name.length <= 47 ? `${name} 副本` : `${name.slice(0, 47).trimEnd()} 副本`
  if (!used.has(base.toLocaleLowerCase())) return base
  for (let index = 2; index < 10000; index += 1) {
    const suffix = ` 副本 ${index}`
    const candidate = `${name.slice(0, 50 - suffix.length).trimEnd()}${suffix}`
    if (!used.has(candidate.toLocaleLowerCase())) return candidate
  }
  throw new Error('无法为导入项目生成唯一名称。')
}

export function remapImportedProject(
  manifest: ProjectArchiveManifest,
  existingNames: string[],
  createId: () => string = randomUUID
): { project: Project; jobs: GenerationJob[]; oldJobIds: Map<string, string> } {
  const projectId = createId()
  const jobIds = new Map(manifest.jobs.map((job) => [job.id, createId()]))
  const assetIds = new Map(
    manifest.jobs.flatMap((job) => job.assets.map((asset) => [asset.id, createId()] as const))
  )
  const jobs = manifest.jobs.map((job) => {
    const id = jobIds.get(job.id)
    if (!id) throw new Error('无法重映射历史记录 ID。')
    return {
      ...job,
      id,
      projectId,
      parentJobId: job.parentJobId ? jobIds.get(job.parentJobId) : undefined,
      sourceAssetId: job.sourceAssetId ? assetIds.get(job.sourceAssetId) : undefined,
      assets: job.assets.map((asset) => {
        const assetId = assetIds.get(asset.id)
        if (!assetId) throw new Error('无法重映射图片 ID。')
        return { ...asset, id: assetId, url: `image-deck://asset/${assetId}` }
      })
    }
  })
  return {
    project: {
      id: projectId,
      name: uniqueImportedProjectName(manifest.project.name, existingNames),
      createdAt: manifest.project.createdAt
    },
    jobs,
    oldJobIds: jobIds
  }
}

export function archiveAssetPath(jobId: string, name: string): string {
  if (!UUID_PATTERN.test(jobId) || !SAFE_ASSET_NAME.test(name)) {
    throw new Error('图片归档路径无效。')
  }
  return `assets/${jobId}/${name}`
}
