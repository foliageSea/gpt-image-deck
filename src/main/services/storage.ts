import { app } from 'electron'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

export function dataPath(...parts: string[]): string {
  return join(app.getPath('userData'), ...parts)
}

export async function ensureDirectory(path: string): Promise<void> {
  await mkdir(path, { recursive: true })
}

export async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T
  } catch {
    return fallback
  }
}

export async function writeJson(path: string, value: unknown): Promise<void> {
  await ensureDirectory(dirname(path))
  const temporaryPath = `${path}.tmp`
  await writeFile(temporaryPath, JSON.stringify(value, null, 2), 'utf8')
  await rename(temporaryPath, path)
}

export async function removePath(path: string): Promise<void> {
  await rm(path, { recursive: true, force: true })
}
