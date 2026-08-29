import type { PromptTemplate, PromptTemplateInput } from '../../shared/image-types'
import { randomUUID } from 'node:crypto'
import { dataPath, readJson, writeJson } from './storage'

const promptsPath = (): string => dataPath('prompts.json')

function normalizeInput(input: PromptTemplateInput): PromptTemplateInput {
  if (!input || typeof input.title !== 'string' || typeof input.content !== 'string') {
    throw new Error('提示词数据无效。')
  }

  const title = input.title.trim()
  const content = input.content.trim()
  if (!title || title.length > 80) throw new Error('名称长度应为 1 到 80 个字符。')
  if (!content || content.length > 32000) throw new Error('提示词长度应为 1 到 32000 个字符。')
  return { title, content }
}

export async function listPrompts(): Promise<PromptTemplate[]> {
  const prompts = await readJson<PromptTemplate[]>(promptsPath(), [])
  if (!Array.isArray(prompts)) return []
  return prompts.filter(
    (prompt) =>
      prompt &&
      typeof prompt.id === 'string' &&
      typeof prompt.title === 'string' &&
      typeof prompt.content === 'string' &&
      typeof prompt.createdAt === 'string' &&
      typeof prompt.updatedAt === 'string'
  )
}

export async function createPrompt(input: PromptTemplateInput): Promise<PromptTemplate[]> {
  const prompts = await listPrompts()
  if (prompts.length >= 500) throw new Error('提示词库最多保存 500 条。')
  const normalized = normalizeInput(input)
  const now = new Date().toISOString()
  const updated = [{ id: randomUUID(), ...normalized, createdAt: now, updatedAt: now }, ...prompts]
  await writeJson(promptsPath(), updated)
  return updated
}

export async function updatePrompt(
  id: string,
  input: PromptTemplateInput
): Promise<PromptTemplate[]> {
  const prompts = await listPrompts()
  if (!prompts.some((prompt) => prompt.id === id)) throw new Error('提示词不存在。')
  const normalized = normalizeInput(input)
  const updated = prompts.map((prompt) =>
    prompt.id === id ? { ...prompt, ...normalized, updatedAt: new Date().toISOString() } : prompt
  )
  await writeJson(promptsPath(), updated)
  return updated
}

export async function deletePrompt(id: string): Promise<PromptTemplate[]> {
  const prompts = await listPrompts()
  const updated = prompts.filter((prompt) => prompt.id !== id)
  if (updated.length === prompts.length) throw new Error('提示词不存在。')
  await writeJson(promptsPath(), updated)
  return updated
}
