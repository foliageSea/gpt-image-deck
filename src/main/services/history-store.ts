import type { GenerationJob } from '../../shared/image-types'
import { dataPath, readJson, writeJson } from './storage'
import { deleteJobAssets, restoreAssets, restoreReferences } from './asset-store'
import { getDefaultProjectId } from './project-store'

let cache: GenerationJob[] | null = null
const historyPath = (): string => dataPath('history.json')

async function history(): Promise<GenerationJob[]> {
  if (!cache) {
    cache = await readJson<GenerationJob[]>(historyPath(), [])
    const defaultProjectId = await getDefaultProjectId()
    let migrated = false
    cache = cache.map((job) => {
      if (job.projectId) return job
      migrated = true
      return { ...job, projectId: defaultProjectId }
    })
    if (migrated) await writeJson(historyPath(), cache)
    for (const job of cache) {
      restoreAssets(job.id, job.assets)
      restoreReferences(job.id, job.references)
    }
  }
  return cache
}

export async function listHistory(projectId: string): Promise<GenerationJob[]> {
  return (await history()).filter((job) => job.projectId === projectId)
}

export async function addHistory(job: GenerationJob): Promise<void> {
  const values = await history()
  const projectJobs = values.filter((value) => value.projectId === job.projectId)
  const removed = projectJobs.slice(199)
  const removedIds = new Set(removed.map((value) => value.id))
  const next = [job, ...values.filter((value) => !removedIds.has(value.id))]
  await writeJson(historyPath(), next)
  cache = next
  await Promise.allSettled(removed.map((value) => deleteJobAssets(value.id)))
}

export async function addImportedHistory(jobs: GenerationJob[]): Promise<void> {
  const values = await history()
  const existingJobIds = new Set(values.map((job) => job.id))
  const existingAssetIds = new Set(
    values.flatMap((job) => [...job.assets, ...(job.references ?? [])].map((asset) => asset.id))
  )
  if (
    jobs.some(
      (job) =>
        existingJobIds.has(job.id) ||
        [...job.assets, ...(job.references ?? [])].some((asset) => existingAssetIds.has(asset.id))
    )
  ) {
    throw new Error('导入项目的历史记录 ID 与现有数据冲突。')
  }
  const next = [...jobs, ...values]
  await writeJson(historyPath(), next)
  cache = next
  for (const job of jobs) {
    restoreAssets(job.id, job.assets)
    restoreReferences(job.id, job.references)
  }
}

export async function deleteHistory(jobId: string): Promise<void> {
  const values = await history()
  if (!values.some((job) => job.id === jobId)) throw new Error('历史记录不存在。')
  const next = values.filter((job) => job.id !== jobId)
  await writeJson(historyPath(), next)
  cache = next
  await Promise.allSettled([deleteJobAssets(jobId)])
}

export async function clearHistory(projectId: string): Promise<void> {
  const values = await history()
  const removed = values.filter((job) => job.projectId === projectId)
  const next = values.filter((job) => job.projectId !== projectId)
  await writeJson(historyPath(), next)
  cache = next
  await Promise.allSettled(removed.map((job) => deleteJobAssets(job.id)))
}

export async function setAssetFavorite(assetId: string, favorite: boolean): Promise<GenerationJob> {
  const values = await history()
  const job = values.find((item) => item.assets.some((asset) => asset.id === assetId))
  if (!job) throw new Error('图片对应的历史记录不存在。')
  job.assets = job.assets.map((asset) => (asset.id === assetId ? { ...asset, favorite } : asset))
  await writeJson(historyPath(), values)
  return job
}
