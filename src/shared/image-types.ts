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
  prompt: string
  referenceIds: string[]
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
  createdAt: string
  status: JobStatus
  prompt: string
  parentJobId?: string
  sourceAssetId?: string
  request: Omit<GenerationRequest, 'referenceIds' | 'parentJobId' | 'sourceAssetId'> & {
    referenceCount: number
  }
  assets: GeneratedAsset[]
  usage?: TokenUsage
  error?: string
}

export interface AppSettings {
  baseUrl: string
  model: string
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

export type GenerationResult =
  { success: true; job: GenerationJob } | { success: false; message: string }

export interface ImageDeckApi {
  getSettings: () => Promise<AppSettings>
  updateSettings: (settings: SettingsUpdate) => Promise<AppSettings>
  setApiKey: (apiKey: string) => Promise<OperationResult>
  clearApiKey: () => Promise<void>
  testConnection: (input: ConnectionTestInput) => Promise<OperationResult>
  pickReferenceImages: () => Promise<ReferenceImage[]>
  useAssetAsReference: (assetId: string) => Promise<ReferenceImage>
  generate: (request: GenerationRequest) => Promise<GenerationResult>
  listHistory: () => Promise<GenerationJob[]>
  deleteHistory: (jobId: string) => Promise<void>
  clearHistory: () => Promise<void>
  setAssetFavorite: (assetId: string, favorite: boolean) => Promise<GenerationJob>
  saveAsset: (assetId: string) => Promise<OperationResult>
  saveAssets: (assetIds: string[]) => Promise<OperationResult>
  showAsset: (assetId: string) => Promise<void>
}
