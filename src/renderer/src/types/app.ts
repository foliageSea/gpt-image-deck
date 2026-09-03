import type {
  GeneratedAsset,
  GenerationJob,
  GenerationRequest,
  ReferenceImage
} from '../../../shared/image-types'

export type Feedback = {
  type: 'info' | 'success' | 'error'
  title: string
  message: string
}

export type SettingsForm = {
  baseUrl: string
  model: string
  apiKey: string
}

export type FlowCreation = {
  job?: GenerationJob
  variant: boolean
  prompt: string
  size: string
  quality: GenerationRequest['quality']
  n: number
  format: GenerationRequest['format']
  compression: number
  background: GenerationRequest['background']
  inputFidelity: GenerationRequest['inputFidelity']
  references: FlowReference[]
}

export type FlowReference = ReferenceImage & {
  kind: 'asset' | 'reference'
  assetId?: string
  primary?: boolean
}

export type PendingFlowGeneration = {
  id: string
  projectId: string
  parentJobId?: string
  prompt: string
  branchIndex: number
  branchCount: number
  status: 'loading' | 'error'
  error?: string
  cancelling: boolean
}

export type FavoriteAssetEntry = {
  asset: GeneratedAsset
  job: GenerationJob
}
