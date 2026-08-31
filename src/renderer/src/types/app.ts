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
  leadingAssets: GeneratedAsset[]
  leadingReferences: ReferenceImage[]
  references: ReferenceImage[]
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
