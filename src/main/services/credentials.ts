import { safeStorage } from 'electron'
import { readFile, unlink, writeFile } from 'node:fs/promises'
import { dataPath } from './storage'

let sessionApiKey = ''
const credentialPath = (): string => dataPath('credentials.bin')

export function isSecureStorageAvailable(): boolean {
  return safeStorage.isEncryptionAvailable()
}

export async function hasApiKey(): Promise<boolean> {
  if (sessionApiKey) return true
  try {
    await readFile(credentialPath())
    return true
  } catch {
    return false
  }
}

export async function getApiKey(): Promise<string> {
  if (sessionApiKey) return sessionApiKey
  try {
    const encrypted = await readFile(credentialPath())
    return safeStorage.decryptString(encrypted)
  } catch {
    return ''
  }
}

export async function setApiKey(value: string): Promise<{ persisted: boolean }> {
  const apiKey = value.trim()
  if (!apiKey) throw new Error('API Key 不能为空。')

  if (isSecureStorageAvailable()) {
    await writeFile(credentialPath(), safeStorage.encryptString(apiKey), { mode: 0o600 })
    sessionApiKey = ''
    return { persisted: true }
  }

  sessionApiKey = apiKey
  return { persisted: false }
}

export async function clearApiKey(): Promise<void> {
  sessionApiKey = ''
  try {
    await unlink(credentialPath())
  } catch {
    // The credential may not have been persisted.
  }
}
