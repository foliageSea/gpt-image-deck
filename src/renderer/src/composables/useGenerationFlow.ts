import type {
  AppSettings,
  GenerationJob,
  GenerationRequest,
  ProjectState
} from '../../../shared/image-types'
import type { FlowCreation, PendingFlowGeneration } from '@/types/app'
import type { ComputedRef, Ref } from 'vue'
import { computed, ref, watch } from 'vue'
import { toast } from 'vue-sonner'

type GenerationFlowOptions = {
  form: GenerationRequest
  settings: Ref<AppSettings>
  projectState: Ref<ProjectState>
  history: Ref<GenerationJob[]>
  pendingGenerations: Ref<PendingFlowGeneration[]>
  selectJob: (job: GenerationJob | null) => void
  openSettings: () => void
}

export type GenerationFlowController = {
  flowCreation: Ref<FlowCreation | null>
  currentPendingGenerations: ComputedRef<PendingFlowGeneration[]>
  generating: ComputedRef<boolean>
  openCreation: (job: GenerationJob, variant: boolean) => void
  openRootCreation: () => void
  generate: () => Promise<void>
  cancelGeneration: (requestId: string) => Promise<void>
  removeGeneration: (requestId: string) => void
}

export function useGenerationFlow(options: GenerationFlowOptions): GenerationFlowController {
  const api = window.imageDeck
  const flowCreation = ref<FlowCreation | null>(null)

  const currentPendingGenerations = computed(() =>
    options.pendingGenerations.value.filter(
      (generation) => generation.projectId === options.projectState.value.currentProjectId
    )
  )
  const generating = computed(() =>
    currentPendingGenerations.value.some((generation) => generation.status === 'loading')
  )

  watch(
    () => options.form.format,
    (format) => {
      if (format === 'jpeg' && options.form.background === 'transparent') {
        options.form.background = 'auto'
        toast.info('JPEG 不支持透明背景，已切换为自动背景。')
      }
    }
  )
  watch(
    () => options.projectState.value.currentProjectId,
    () => {
      flowCreation.value = null
    }
  )

  function openCreation(job: GenerationJob, variant: boolean): void {
    flowCreation.value = {
      job,
      variant,
      prompt: job.prompt,
      size: job.request.size,
      quality: job.request.quality,
      n: job.request.n,
      leadingAssets: [],
      leadingReferences: [],
      references: []
    }
  }

  function openRootCreation(): void {
    flowCreation.value = {
      variant: false,
      prompt: '',
      size: options.form.size,
      quality: options.form.quality,
      n: options.form.n,
      leadingAssets: [],
      leadingReferences: [],
      references: []
    }
  }

  async function generate(): Promise<void> {
    const creation = flowCreation.value
    const asset = creation?.job?.assets[0]
    if (!creation || (creation.job && !asset) || !creation.prompt.trim()) return
    if (!options.settings.value.hasApiKey) {
      options.openSettings()
      toast.info('请先配置 API Key。')
      return
    }

    const projectId = options.projectState.value.currentProjectId
    const prompt = creation.prompt.trim()
    const requestIds: string[] = Array.from({ length: creation.n }, () => crypto.randomUUID())
    options.pendingGenerations.value.push(
      ...requestIds.map((id, index) => ({
        id,
        projectId,
        parentJobId: creation.job?.id,
        prompt,
        branchIndex: index + 1,
        branchCount: requestIds.length,
        status: 'loading' as const,
        cancelling: false
      }))
    )
    flowCreation.value = null
    try {
      const leadingAssetReferences = await Promise.all(
        creation.leadingAssets.map((item) => api.useAssetAsReference(item.id))
      )
      const sourceReference = asset ? await api.useAssetAsReference(asset.id) : null
      const referenceIds = [
        ...leadingAssetReferences.map((item) => item.id),
        ...creation.leadingReferences.map((item) => item.id),
        ...(sourceReference ? [sourceReference.id] : []),
        ...creation.references.map((item) => item.id)
      ]
      const results = await Promise.all(
        requestIds.map(async (requestId) => {
          const pending = options.pendingGenerations.value.find((item) => item.id === requestId)
          if (!pending) return false
          if (pending.cancelling) {
            removeGeneration(requestId)
            return false
          }
          try {
            const result = await api.generate(
              {
                projectId,
                prompt,
                referenceIds,
                parentJobId: creation.job?.id,
                sourceAssetId: asset?.id,
                n: 1,
                size: creation.size,
                quality: creation.quality,
                format: creation.job?.request.format ?? options.form.format,
                compression: creation.job?.request.compression ?? options.form.compression,
                background: creation.job?.request.background ?? options.form.background,
                inputFidelity: creation.job
                  ? creation.variant
                    ? 'low'
                    : 'high'
                  : options.form.inputFidelity
              },
              requestId
            )
            const active = options.pendingGenerations.value.find((item) => item.id === requestId)
            if (!active) return false
            if (active.cancelling) {
              removeGeneration(requestId)
              return false
            }
            if (!result.success) {
              active.status = 'error'
              active.error = result.message
              toast.error(`分支 ${active.branchIndex} 生成失败：${result.message}`, {
                duration: 8000
              })
              return false
            }
            if (result.job.projectId === options.projectState.value.currentProjectId) {
              options.history.value.unshift(result.job)
              options.selectJob(result.job)
            }
            removeGeneration(requestId)
            return true
          } catch (error) {
            const active = options.pendingGenerations.value.find((item) => item.id === requestId)
            if (!active) return false
            if (active.cancelling) {
              removeGeneration(requestId)
            } else {
              const message = error instanceof Error ? error.message : '图片生成失败。'
              active.status = 'error'
              active.error = message
              toast.error(`分支 ${active.branchIndex} 生成失败：${message}`, { duration: 8000 })
            }
            return false
          }
        })
      )
      const completedCount = results.filter(Boolean).length
      if (completedCount) toast.success(`已生成 ${completedCount} 个独立分支节点。`)
    } catch (error) {
      const message = error instanceof Error ? error.message : '分支节点生成失败。'
      for (const generation of options.pendingGenerations.value.filter((item) =>
        requestIds.includes(item.id)
      )) {
        if (generation.cancelling) removeGeneration(generation.id)
        else {
          generation.status = 'error'
          generation.error = message
        }
      }
      toast.error(message, { duration: 8000 })
    }
  }

  async function cancelGeneration(requestId: string): Promise<void> {
    const generation = options.pendingGenerations.value.find((item) => item.id === requestId)
    if (!generation || generation.cancelling) return
    generation.cancelling = true
    try {
      await api.cancelGeneration(generation.id)
      toast.info('正在中断节点生成。')
    } catch (error) {
      generation.cancelling = false
      toast.error(error instanceof Error ? error.message : '无法中断节点生成。')
    }
  }

  function removeGeneration(requestId: string): void {
    options.pendingGenerations.value = options.pendingGenerations.value.filter(
      (generation) => generation.id !== requestId
    )
  }

  return {
    flowCreation,
    currentPendingGenerations,
    generating,
    openCreation,
    openRootCreation,
    generate,
    cancelGeneration,
    removeGeneration
  }
}
