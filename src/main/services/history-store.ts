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
  const next = [job, ...values].slice(0, 200)
  const removed = values.slice(199)
  await writeJson(historyPath(), next)
  cache = next
  await Promise.allSettled(removed.map((value) => deleteJobAssets(value.id)))
}

export async function deleteHistory(jobId: string): Promise<void> {
  const values = await history()
  if (!values.some((job) => job.id === jobId)) throw new Error('历史记录不存在。')
  const next = values.filter((job) => job.id !== jobId)
  await writeJson(historyPath(), next)
  cache = next
  await Promise.allSettled([deleteJobAssets(jobId)])
}

export async function clearHistory(): Promise<void> {
  const values = await history()
  await writeJson(historyPath(), [])
  cache = []
  await Promise.allSettled(values.map((job) => deleteJobAssets(job.id)))
}
