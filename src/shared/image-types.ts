export type ImageQuality = 'auto' | 'low' | 'medium' | 'high'
export type ImageFormat = 'png' | 'jpeg' | 'webp'
export type ImageBackground = 'auto' | 'opaque' | 'transparent'
export type InputFidelity = 'low' | 'high'
export type JobStatus = 'completed' | 'partial' | 'failed'

export interface ReferenceImage {
  id: string
  name: string
  mimeType: string
  size: number
  url: string
}

export interface GenerationRequest {
  projectId: string
  prompt: string
  referenceIds: string[]
  referenceAssetIds: Array<string | null>
  parentJobId?: string
  sourceAssetId?: string
  n: number
  size: string
  quality: ImageQuality
  format: ImageFormat
  compression: number
  background: ImageBackground
  inputFidelity: InputFidelity
}

export interface StoredReferenceImage extends ReferenceImage {
  originalName: string
  sourceAssetId?: string
}

export interface GeneratedAsset {
  id: string
  name: string
  mimeType: string
  size: number
  url: string
  favorite?: boolean
}

export interface TokenUsage {
  totalTokens?: number
  inputTokens?: number
  outputTokens?: number
}

export interface GenerationJob {
  id: string
  projectId: string
  createdAt: string
  status: JobStatus
  prompt: string
  parentJobId?: string
  sourceAssetId?: string
  model?: string
  request: Omit<
    GenerationRequest,
    'projectId' | 'referenceIds' | 'referenceAssetIds' | 'parentJobId' | 'sourceAssetId'
  > & {
    referenceCount: number
  }
  assets: GeneratedAsset[]
  references?: StoredReferenceImage[]
  usage?: TokenUsage
  error?: string
}

export interface AppSettings {
  baseUrl: string
  model: string
  backgroundImageUrl?: string
  hasApiKey: boolean
  secureStorageAvailable: boolean
}

export interface SettingsUpdate {
  baseUrl: string
  model: string
}

export interface ConnectionTestInput extends SettingsUpdate {
  apiKey?: string
}

export interface OperationResult {
  success: boolean
  message?: string
}

export interface Project {
  id: string
  name: string
  createdAt: string
}

export interface ProjectState {
  projects: Project[]
  currentProjectId: string
}

export type ProjectImportResult =
  | {
      success: true
      message: string
      state: ProjectState
      project: Project
      jobCount: number
      assetCount: number
    }
  | { success: false; message: string }

export interface PromptTemplate {
  id: string
  title: string
  content: string
  createdAt: string
  updatedAt: string
}

export interface PromptTemplateInput {
  title: string
  content: string
}

export type DesktopPlatform = 'darwin' | 'win32' | 'linux'

export interface WindowControlsApi {
  platform: DesktopPlatform
  minimize: () => Promise<void>
  toggleMaximize: () => Promise<boolean>
  close: () => Promise<void>
  isMaximized: () => Promise<boolean>
  onMaximizedChange: (callback: (maximized: boolean) => void) => () => void
}

export type GenerationResult =
  { success: true; job: GenerationJob } | { success: false; message: string }

export interface ImageDeckApi {
  windowControls: WindowControlsApi
  getSettings: () => Promise<AppSettings>
  updateSettings: (settings: SettingsUpdate) => Promise<AppSettings>
  pickBackgroundImage: () => Promise<AppSettings>
  clearBackgroundImage: () => Promise<AppSettings>
  setApiKey: (apiKey: string) => Promise<OperationResult>
  clearApiKey: () => Promise<void>
  testConnection: (input: ConnectionTestInput) => Promise<OperationResult>
  pickReferenceImages: () => Promise<ReferenceImage[]>
  useAssetAsReference: (assetId: string) => Promise<ReferenceImage>
  generate: (request: GenerationRequest, requestId?: string) => Promise<GenerationResult>
  cancelGeneration: (requestId: string) => Promise<void>
  getProjects: () => Promise<ProjectState>
  createProject: (name: string) => Promise<ProjectState>
  renameProject: (projectId: string, name: string) => Promise<ProjectState>
  selectProject: (projectId: string) => Promise<ProjectState>
  deleteProject: (projectId: string) => Promise<ProjectState>
  exportProject: (projectId: string) => Promise<OperationResult>
  importProject: () => Promise<ProjectImportResult>
  listPrompts: () => Promise<PromptTemplate[]>
  createPrompt: (input: PromptTemplateInput) => Promise<PromptTemplate[]>
  updatePrompt: (id: string, input: PromptTemplateInput) => Promise<PromptTemplate[]>
  deletePrompt: (id: string) => Promise<PromptTemplate[]>
  listHistory: (projectId: string) => Promise<GenerationJob[]>
  deleteHistory: (jobId: string) => Promise<void>
  clearHistory: (projectId: string) => Promise<void>
  setAssetFavorite: (assetId: string, favorite: boolean) => Promise<GenerationJob>
  saveAsset: (assetId: string) => Promise<OperationResult>
  saveAssets: (assetIds: string[]) => Promise<OperationResult>
  copyAsset: (assetId: string) => Promise<OperationResult>
  showAsset: (assetId: string) => Promise<void>
}
