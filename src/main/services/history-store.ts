import type { GenerationJob } from '../../shared/image-types'
import { dataPath, readJson, writeJson } from './storage'
import { deleteJobAssets, restoreAssets } from './asset-store'

let cache: GenerationJob[] | null = null
const historyPath = (): string => dataPath('history.json')

async function history(): Promise<GenerationJob[]> {
  if (!cache) {
    cache = await readJson<GenerationJob[]>(historyPath(), [])
    for (const job of cache) restoreAssets(job.id, job.assets)
  }
  return cache
}

export async function listHistory(): Promise<GenerationJob[]> {
  return [...(await history())]
}

export async function addHistory(job: GenerationJob): Promise<void> {
  const values = await history()
  values.unshift(job)
  cache = values.slice(0, 200)
  await writeJson(historyPath(), cache)
}

export async function deleteHistory(jobId: string): Promise<void> {
  cache = (await history()).filter((job) => job.id !== jobId)
  await Promise.all([writeJson(historyPath(), cache), deleteJobAssets(jobId)])
}

export async function clearHistory(): Promise<void> {
  const values = await history()
  await Promise.all(values.map((job) => deleteJobAssets(job.id)))
  cache = []
  await writeJson(historyPath(), cache)
}
