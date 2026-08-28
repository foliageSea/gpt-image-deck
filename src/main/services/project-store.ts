import type { Project, ProjectState } from '../../shared/image-types'
import { randomUUID } from 'node:crypto'
import { dataPath, readJson, writeJson } from './storage'

let cache: ProjectState | null = null
const projectsPath = (): string => dataPath('projects.json')

function newProject(name: string): Project {
  return { id: randomUUID(), name, createdAt: new Date().toISOString() }
}

async function state(): Promise<ProjectState> {
  if (!cache) {
    const stored = await readJson<ProjectState | null>(projectsPath(), null)
    if (
      stored?.projects.length &&
      stored.projects.some((item) => item.id === stored.currentProjectId)
    ) {
      cache = stored
    } else {
      const project = newProject('默认项目')
      cache = { projects: [project], currentProjectId: project.id }
      await writeJson(projectsPath(), cache)
    }
  }
  return cache
}

function normalizeName(value: string): string {
  const name = value.trim()
  if (!name || name.length > 50) throw new Error('项目名称长度应为 1 到 50 个字符。')
  return name
}

export async function getProjectState(): Promise<ProjectState> {
  const value = await state()
  return { projects: [...value.projects], currentProjectId: value.currentProjectId }
}

export async function getDefaultProjectId(): Promise<string> {
  return (await state()).projects[0].id
}

export async function createProject(name: string): Promise<ProjectState> {
  const value = await state()
  const normalized = normalizeName(name)
  if (
    value.projects.some((item) => item.name.toLocaleLowerCase() === normalized.toLocaleLowerCase())
  ) {
    throw new Error('已存在同名项目。')
  }
  const project = newProject(normalized)
  cache = { projects: [...value.projects, project], currentProjectId: project.id }
  await writeJson(projectsPath(), cache)
  return getProjectState()
}

export async function selectProject(projectId: string): Promise<ProjectState> {
  const value = await state()
  if (!value.projects.some((item) => item.id === projectId)) throw new Error('项目不存在。')
  cache = { ...value, currentProjectId: projectId }
  await writeJson(projectsPath(), cache)
  return getProjectState()
}

export async function deleteProject(projectId: string): Promise<ProjectState> {
  const value = await state()
  if (value.projects.length === 1) throw new Error('至少需要保留一个项目。')
  if (!value.projects.some((item) => item.id === projectId)) throw new Error('项目不存在。')
  const projects = value.projects.filter((item) => item.id !== projectId)
  cache = {
    projects,
    currentProjectId: value.currentProjectId === projectId ? projects[0].id : value.currentProjectId
  }
  await writeJson(projectsPath(), cache)
  return getProjectState()
}
