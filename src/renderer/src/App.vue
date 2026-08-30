<script setup lang="ts">
import type {
  AppSettings,
  GeneratedAsset,
  GenerationJob,
  GenerationRequest,
  PromptTemplate,
  PromptTemplateInput,
  Project,
  ProjectState,
  ReferenceImage
} from '../../shared/image-types'
import {
  BookOpenIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  DownloadIcon,
  ImageIcon,
  LoaderCircleIcon,
  PlusIcon,
  SparklesIcon,
  Trash2Icon,
  UploadCloudIcon,
  XIcon
} from '@lucide/vue'
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import ImagePreview from '@/components/ImagePreview.vue'
import GenerationFlow from '@/components/GenerationFlow.vue'
import PromptLibraryDialog from '@/components/PromptLibraryDialog.vue'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Toaster } from '@/components/ui/sonner'
import { Textarea } from '@/components/ui/textarea'

const api = window.imageDeck
const settings = ref<AppSettings>({
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-image-2',
  hasApiKey: false,
  secureStorageAvailable: false
})
const backgroundImageUrl = computed(() => settings.value.backgroundImageUrl)
const settingsForm = reactive({ baseUrl: '', model: '', apiKey: '' })
const settingsOpen = ref(false)
const testing = ref(false)
const projectState = ref<ProjectState>({ projects: [], currentProjectId: '' })
const projectsOpen = ref(false)
const projectName = ref('')
const editingProjectName = ref('')
const projectNameEditing = ref(false)
const creatingProject = ref(false)
const renamingProject = ref(false)
const changingProject = ref(false)
const pendingDeleteProject = ref<Project | null>(null)
const deletingProject = ref(false)
const exportingProject = ref(false)
const importingProject = ref(false)
const history = ref<GenerationJob[]>([])
const selectedJob = ref<GenerationJob | null>(null)
const selectedAsset = ref<GeneratedAsset | null>(null)
const previewOpen = ref(false)
const pendingFlowGenerations = ref<
  {
    id: string
    projectId: string
    parentJobId?: string
    prompt: string
    branchIndex: number
    branchCount: number
    status: 'loading' | 'error'
    error?: string
    cancelling: boolean
  }[]
>([])
const prompts = ref<PromptTemplate[]>([])
const promptsOpen = ref(false)
const pendingDeleteJob = ref<GenerationJob | null>(null)
const deleting = ref(false)
type Feedback = { type: 'info' | 'success' | 'error'; title: string; message: string }
const connectionFeedback = ref<Feedback | null>(null)
type FlowCreation = {
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
const flowCreation = ref<FlowCreation | null>(null)

const availableLeadingAssets = computed(() => {
  const job = flowCreation.value?.job
  return job ? priorSourceAssets(job) : []
})

function priorSourceAssets(job: GenerationJob): GeneratedAsset[] {
  const jobsById = new Map(history.value.map((item) => [item.id, item]))
  const assetsById = new Map(
    history.value.flatMap((item) => item.assets.map((asset) => [asset.id, asset] as const))
  )
  const assets: GeneratedAsset[] = []
  const visited = new Set<string>()
  let current: GenerationJob | undefined = job
  while (current && !visited.has(current.id)) {
    visited.add(current.id)
    if (current.sourceAssetId) {
      const asset = assetsById.get(current.sourceAssetId)
      if (asset) assets.push(asset)
    }
    current = current.parentJobId ? jobsById.get(current.parentJobId) : undefined
  }
  return assets.reverse().slice(-15)
}

const form = reactive<GenerationRequest>({
  projectId: '',
  prompt: '',
  referenceIds: [],
  n: 1,
  size: '1024x1024',
  quality: 'auto',
  format: 'png',
  compression: 90,
  background: 'auto',
  inputFidelity: 'low'
})

const currentPendingFlowGenerations = computed(() =>
  pendingFlowGenerations.value.filter(
    (generation) => generation.projectId === projectState.value.currentProjectId
  )
)
const projectBusy = computed(
  () =>
    currentPendingFlowGenerations.value.some((generation) => generation.status === 'loading') ||
    exportingProject.value ||
    importingProject.value
)
const currentProject = computed(() =>
  projectState.value.projects.find((project) => project.id === projectState.value.currentProjectId)
)
const currentAssets = computed(() => selectedJob.value?.assets ?? [])

watch(
  () => form.format,
  (format) => {
    if (format === 'jpeg' && form.background === 'transparent') {
      form.background = 'auto'
      toast.info('JPEG 不支持透明背景，已切换为自动背景。')
    }
  }
)

watch(projectsOpen, (open) => {
  if (!open) cancelProjectNameEditing()
})

async function load(): Promise<void> {
  try {
    const [nextSettings, nextProjects, nextPrompts] = await Promise.all([
      api.getSettings(),
      api.getProjects(),
      api.listPrompts()
    ])
    const nextHistory = await api.listHistory(nextProjects.currentProjectId)
    settings.value = nextSettings
    prompts.value = nextPrompts
    projectState.value = nextProjects
    form.projectId = nextProjects.currentProjectId
    editingProjectName.value =
      nextProjects.projects.find((project) => project.id === nextProjects.currentProjectId)?.name ??
      ''
    history.value = nextHistory
    settingsForm.baseUrl = nextSettings.baseUrl
    settingsForm.model = nextSettings.model
    if (nextHistory[0]) selectJob(nextHistory[0])
    if (!nextSettings.hasApiKey) settingsOpen.value = true
  } catch (error) {
    toast.error(error instanceof Error ? error.message : '应用数据加载失败。')
  }
}

function resetProjectContext(): void {
  selectJob(null)
  flowCreation.value = null
}

async function applyProjectState(next: ProjectState): Promise<void> {
  projectState.value = next
  const projectIds = new Set(next.projects.map((project) => project.id))
  pendingFlowGenerations.value = pendingFlowGenerations.value.filter((generation) =>
    projectIds.has(generation.projectId)
  )
  form.projectId = next.currentProjectId
  editingProjectName.value =
    next.projects.find((project) => project.id === next.currentProjectId)?.name ?? ''
  projectNameEditing.value = false
  resetProjectContext()
  history.value = await api.listHistory(next.currentProjectId)
  selectJob(history.value[0] ?? null)
}

async function switchProject(projectId: unknown): Promise<void> {
  if (typeof projectId !== 'string' || projectId === projectState.value.currentProjectId) return
  changingProject.value = true
  try {
    await applyProjectState(await api.selectProject(projectId))
  } catch (error) {
    toast.error(error instanceof Error ? error.message : '项目切换失败。')
  } finally {
    changingProject.value = false
  }
}

async function createNewProject(): Promise<void> {
  if (!projectName.value.trim() || creatingProject.value) return
  creatingProject.value = true
  try {
    await applyProjectState(await api.createProject(projectName.value))
    projectName.value = ''
    projectsOpen.value = false
    toast.success('项目已创建。')
  } catch (error) {
    toast.error(error instanceof Error ? error.message : '项目创建失败。')
  } finally {
    creatingProject.value = false
  }
}

async function renameCurrentProject(): Promise<void> {
  const project = currentProject.value
  if (!project || !editingProjectName.value.trim() || renamingProject.value) return
  renamingProject.value = true
  try {
    projectState.value = await api.renameProject(project.id, editingProjectName.value)
    editingProjectName.value =
      projectState.value.projects.find((item) => item.id === project.id)?.name ?? ''
    projectNameEditing.value = false
    toast.success('项目名称已更新。')
  } catch (error) {
    toast.error(error instanceof Error ? error.message : '项目名称更新失败。')
  } finally {
    renamingProject.value = false
  }
}

function editCurrentProjectName(): void {
  editingProjectName.value = currentProject.value?.name ?? ''
  projectNameEditing.value = true
}

function cancelProjectNameEditing(): void {
  editingProjectName.value = currentProject.value?.name ?? ''
  projectNameEditing.value = false
}

async function exportCurrentProject(): Promise<void> {
  const project = currentProject.value
  if (!project || exportingProject.value) return
  exportingProject.value = true
  try {
    const result = await api.exportProject(project.id)
    if (result.success) toast.success(result.message ?? '项目已导出。')
    else toast.info(result.message ?? '已取消导出。')
  } catch (error) {
    toast.error(error instanceof Error ? error.message : '项目导出失败。')
  } finally {
    exportingProject.value = false
  }
}

async function importProjectArchive(): Promise<void> {
  if (importingProject.value) return
  importingProject.value = true
  try {
    const result = await api.importProject()
    if (!result.success) {
      toast.info(result.message)
      return
    }
    await applyProjectState(result.state)
    projectsOpen.value = false
    toast.success(result.message, {
      description: `已恢复 ${result.jobCount} 条历史记录和 ${result.assetCount} 张图片。`
    })
  } catch (error) {
    toast.error(error instanceof Error ? error.message : '项目导入失败。', { duration: 8000 })
  } finally {
    importingProject.value = false
  }
}

async function deleteCurrentProject(): Promise<void> {
  const project = pendingDeleteProject.value
  if (!project) return
  deletingProject.value = true
  try {
    await applyProjectState(await api.deleteProject(project.id))
    pendingDeleteProject.value = null
    toast.success('项目及其历史记录已删除。')
  } catch (error) {
    toast.error(error instanceof Error ? error.message : '项目删除失败。')
  } finally {
    deletingProject.value = false
  }
}

function confirmDeleteProject(): void {
  pendingDeleteProject.value = currentProject.value ?? null
  projectsOpen.value = false
}

function selectJob(job: GenerationJob | null): void {
  selectedJob.value = job
  selectedAsset.value = job?.assets[0] ?? null
}

function continueWithAsset(
  _asset: GeneratedAsset,
  variant = false,
  sourceJob = selectedJob.value
): void {
  if (!sourceJob) return
  selectJob(sourceJob)
  previewOpen.value = false
  openFlowCreation(sourceJob, variant)
}

function selectFlowJob(job: GenerationJob): void {
  selectJob(job)
}

function previewFlowJob(job: GenerationJob): void {
  selectJob(job)
  const asset = job.assets[0]
  if (asset) openPreview(asset)
}

function openFlowCreation(job: GenerationJob, variant: boolean): void {
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

function openNewFlowCreation(): void {
  flowCreation.value = {
    variant: false,
    prompt: '',
    size: form.size,
    quality: form.quality,
    n: form.n,
    leadingAssets: [],
    leadingReferences: [],
    references: []
  }
}

async function pickFlowReferences(position: 'before' | 'after' = 'after'): Promise<void> {
  const creation = flowCreation.value
  if (!creation) return
  try {
    const picked = await api.pickReferenceImages()
    const existingIds = new Set(
      [...creation.leadingReferences, ...creation.references].map((item) => item.id)
    )
    const unique = picked.filter((item) => !existingIds.has(item.id))
    const available =
      (creation.job ? 15 : 16) -
      creation.leadingAssets.length -
      creation.leadingReferences.length -
      creation.references.length
    if (position === 'before') {
      creation.leadingReferences.push(...unique.slice(0, available))
    } else {
      creation.references.push(...unique.slice(0, available))
    }
  } catch (error) {
    toast.error(error instanceof Error ? error.message : '参考图片读取失败。')
  }
}

function removeFlowReference(id: string, position: 'before' | 'after' = 'after'): void {
  if (!flowCreation.value) return
  const key = position === 'before' ? 'leadingReferences' : 'references'
  flowCreation.value[key] = flowCreation.value[key].filter((item) => item.id !== id)
}

function toggleLeadingAsset(asset: GeneratedAsset): void {
  const creation = flowCreation.value
  if (!creation) return
  if (creation.leadingAssets.some((item) => item.id === asset.id)) {
    creation.leadingAssets = creation.leadingAssets.filter((item) => item.id !== asset.id)
    return
  }
  if (
    creation.leadingAssets.length +
      creation.leadingReferences.length +
      creation.references.length >=
    15
  ) {
    toast.info('参考图片最多 16 张（含当前节点）。')
    return
  }
  creation.leadingAssets.push(asset)
}

function isLeadingAssetSelected(asset: GeneratedAsset): boolean {
  return flowCreation.value?.leadingAssets.some((item) => item.id === asset.id) ?? false
}

function flowReferenceOrder(
  kind: 'leading-asset' | 'leading-reference' | 'source' | 'reference',
  id?: string
): number | undefined {
  const creation = flowCreation.value
  if (!creation) return undefined
  if (kind === 'leading-asset') {
    const index = creation.leadingAssets.findIndex((item) => item.id === id)
    return index < 0 ? undefined : index + 1
  }
  if (kind === 'leading-reference') {
    const index = creation.leadingReferences.findIndex((item) => item.id === id)
    return index < 0 ? undefined : creation.leadingAssets.length + index + 1
  }
  const sourceOrder = creation.leadingAssets.length + creation.leadingReferences.length + 1
  if (kind === 'source') return creation.job ? sourceOrder : undefined
  const index = creation.references.findIndex((item) => item.id === id)
  if (index < 0) return undefined
  return (
    creation.leadingAssets.length +
    creation.leadingReferences.length +
    (creation.job ? 1 : 0) +
    index +
    1
  )
}

async function generateFromFlow(): Promise<void> {
  const creation = flowCreation.value
  const asset = creation?.job?.assets[0]
  if (!creation || (creation.job && !asset) || !creation.prompt.trim()) return
  if (!settings.value.hasApiKey) {
    settingsOpen.value = true
    toast.info('请先配置 API Key。')
    return
  }

  const projectId = projectState.value.currentProjectId
  const prompt = creation.prompt.trim()
  const requestIds: string[] = Array.from({ length: creation.n }, () => crypto.randomUUID())
  pendingFlowGenerations.value.push(
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
        const pending = pendingFlowGenerations.value.find((item) => item.id === requestId)
        if (!pending) return false
        if (pending.cancelling) {
          pendingFlowGenerations.value = pendingFlowGenerations.value.filter(
            (item) => item.id !== requestId
          )
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
              format: creation.job?.request.format ?? form.format,
              compression: creation.job?.request.compression ?? form.compression,
              background: creation.job?.request.background ?? form.background,
              inputFidelity: creation.job ? (creation.variant ? 'low' : 'high') : form.inputFidelity
            },
            requestId
          )
          const active = pendingFlowGenerations.value.find((item) => item.id === requestId)
          if (!active) return false
          if (active.cancelling) {
            pendingFlowGenerations.value = pendingFlowGenerations.value.filter(
              (item) => item.id !== requestId
            )
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
          if (result.job.projectId === projectState.value.currentProjectId) {
            history.value.unshift(result.job)
            selectJob(result.job)
          }
          pendingFlowGenerations.value = pendingFlowGenerations.value.filter(
            (item) => item.id !== requestId
          )
          return true
        } catch (error) {
          const active = pendingFlowGenerations.value.find((item) => item.id === requestId)
          if (!active) return false
          if (active.cancelling) {
            pendingFlowGenerations.value = pendingFlowGenerations.value.filter(
              (item) => item.id !== requestId
            )
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
    for (const generation of pendingFlowGenerations.value.filter((item) =>
      requestIds.includes(item.id)
    )) {
      if (generation.cancelling) removeFlowGeneration(generation.id)
      else {
        generation.status = 'error'
        generation.error = message
      }
    }
    toast.error(message, { duration: 8000 })
  }
}

async function cancelFlowGeneration(requestId: string): Promise<void> {
  const generation = pendingFlowGenerations.value.find((item) => item.id === requestId)
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

function removeFlowGeneration(requestId: string): void {
  pendingFlowGenerations.value = pendingFlowGenerations.value.filter(
    (generation) => generation.id !== requestId
  )
}

async function toggleFavorite(asset: GeneratedAsset): Promise<void> {
  try {
    const updated = await api.setAssetFavorite(asset.id, !asset.favorite)
    const index = history.value.findIndex((job) => job.id === updated.id)
    if (index >= 0) history.value[index] = updated
    if (selectedJob.value?.id === updated.id) {
      selectedJob.value = updated
      selectedAsset.value =
        updated.assets.find((item) => item.id === asset.id) ?? updated.assets[0] ?? null
    }
    toast.success(asset.favorite ? '已取消收藏。' : '已收藏图片。')
  } catch (error) {
    toast.error(error instanceof Error ? error.message : '收藏操作失败。')
  }
}

function openPromptLibrary(): void {
  promptsOpen.value = true
}

function fillPrompt(prompt: PromptTemplate): void {
  if (flowCreation.value) flowCreation.value.prompt = prompt.content
  promptsOpen.value = false
  toast.success(`已填入“${prompt.title}”。`)
}

async function createPrompt(input: PromptTemplateInput): Promise<void> {
  try {
    prompts.value = await api.createPrompt(input)
    toast.success('提示词已保存。')
  } catch (error) {
    toast.error(error instanceof Error ? error.message : '提示词保存失败。')
  }
}

async function updatePrompt(id: string, input: PromptTemplateInput): Promise<void> {
  try {
    prompts.value = await api.updatePrompt(id, input)
    toast.success('提示词已更新。')
  } catch (error) {
    toast.error(error instanceof Error ? error.message : '提示词更新失败。')
  }
}

async function deletePrompt(id: string): Promise<void> {
  try {
    prompts.value = await api.deletePrompt(id)
    toast.success('提示词已删除。')
  } catch (error) {
    toast.error(error instanceof Error ? error.message : '提示词删除失败。')
  }
}

async function deleteJob(): Promise<void> {
  const job = pendingDeleteJob.value
  if (!job) return
  deleting.value = true
  try {
    await api.deleteHistory(job.id)
    history.value = history.value.filter((value) => value.id !== job.id)
    if (selectedJob.value?.id === job.id) selectJob(history.value[0] ?? null)
    pendingDeleteJob.value = null
    toast.success('历史记录已删除。')
  } catch (error) {
    toast.error(error instanceof Error ? error.message : '删除失败。')
  } finally {
    deleting.value = false
  }
}

async function saveAsset(asset: GeneratedAsset): Promise<void> {
  try {
    const result = await api.saveAsset(asset.id)
    if (result.success) toast.success(result.message ?? '图片已保存。')
  } catch (error) {
    toast.error(error instanceof Error ? error.message : '保存失败。')
  }
}

async function copyAsset(asset: GeneratedAsset): Promise<void> {
  try {
    const result = await api.copyAsset(asset.id)
    if (result.success) toast.success(result.message ?? '图片已复制到剪贴板。')
  } catch (error) {
    toast.error(error instanceof Error ? error.message : '复制图片失败。')
  }
}

function openPreview(asset: GeneratedAsset): void {
  selectedAsset.value = asset
  previewOpen.value = true
}

function selectPreviewAsset(asset: GeneratedAsset): void {
  selectedAsset.value = asset
}

async function saveSettings(): Promise<void> {
  try {
    settings.value = await api.updateSettings({
      baseUrl: settingsForm.baseUrl,
      model: settingsForm.model
    })
    if (settingsForm.apiKey.trim()) {
      const result = await api.setApiKey(settingsForm.apiKey)
      settings.value = await api.getSettings()
      settingsForm.apiKey = ''
      toast.success(result.message ?? 'API Key 已保存。')
    } else {
      toast.success('连接设置已保存。')
    }
    settingsOpen.value = false
  } catch (error) {
    toast.error(error instanceof Error ? error.message : '设置保存失败。')
  }
}

async function testSettings(): Promise<void> {
  testing.value = true
  connectionFeedback.value = {
    type: 'info',
    title: '正在测试连接',
    message: '正在验证接口地址、API Key 和模型访问权限…'
  }
  try {
    const result = await api.testConnection({
      baseUrl: settingsForm.baseUrl,
      model: settingsForm.model,
      apiKey: settingsForm.apiKey.trim() || undefined
    })
    const message = result.message ?? (result.success ? '连接成功。' : '连接失败。')
    connectionFeedback.value = {
      type: result.success ? 'success' : 'error',
      title: result.success ? '连接成功' : '连接失败',
      message
    }
    result.success ? toast.success(message) : toast.error(message, { duration: 8000 })
  } catch (error) {
    const message = error instanceof Error ? error.message : '连接测试失败。'
    connectionFeedback.value = { type: 'error', title: '连接失败', message }
    toast.error(message, { duration: 8000 })
  } finally {
    testing.value = false
  }
}

async function clearCredential(): Promise<void> {
  await api.clearApiKey()
  settings.value = await api.getSettings()
  toast.success('API Key 已清除。')
}

async function pickWindowBackground(): Promise<void> {
  try {
    settings.value = await api.pickBackgroundImage()
  } catch (error) {
    toast.error(error instanceof Error ? error.message : '背景图片设置失败。')
  }
}

async function clearWindowBackground(): Promise<void> {
  try {
    settings.value = await api.clearBackgroundImage()
  } catch (error) {
    toast.error(error instanceof Error ? error.message : '背景图片清除失败。')
  }
}

onMounted(load)
</script>

<template>
  <GenerationFlow
    :history="history"
    :projects="projectState.projects"
    :current-project-id="projectState.currentProjectId"
    :selected-job-id="selectedJob?.id"
    :project-busy="projectBusy || changingProject"
    :background-image-url="backgroundImageUrl"
    :pending-generations="currentPendingFlowGenerations"
    @select="selectFlowJob"
    @preview="previewFlowJob"
    @create="openFlowCreation"
    @create-root="openNewFlowCreation"
    @switch-project="switchProject"
    @manage-projects="projectsOpen = true"
    @delete="pendingDeleteJob = $event"
    @cancel-generation="cancelFlowGeneration"
    @remove-generation="removeFlowGeneration"
    @open-settings="settingsOpen = true"
  />
  <Dialog :open="Boolean(pendingDeleteJob)" @update:open="!$event && (pendingDeleteJob = null)">
    <DialogContent :show-close-button="false">
      <DialogHeader>
        <DialogTitle>永久删除这条历史？</DialogTitle>
      </DialogHeader>
      <DialogFooter>
        <Button variant="outline" :disabled="deleting" @click="pendingDeleteJob = null"
          >取消</Button
        >
        <Button variant="destructive" :disabled="deleting" @click="deleteJob">
          <LoaderCircleIcon v-if="deleting" data-icon="inline-start" class="animate-spin" />
          永久删除
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>

  <Dialog v-model:open="projectsOpen">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>项目管理</DialogTitle>
      </DialogHeader>
      <FieldGroup>
        <Field>
          <FieldLabel for="project-name">新项目名称</FieldLabel>
          <div class="flex gap-2">
            <Input
              id="project-name"
              v-model="projectName"
              maxlength="50"
              placeholder="例如：夏季产品视觉"
              @keydown.enter="createNewProject"
            />
            <Button
              :disabled="!projectName.trim() || creatingProject || projectBusy"
              @click="createNewProject"
            >
              <LoaderCircleIcon
                v-if="creatingProject"
                data-icon="inline-start"
                class="animate-spin"
              />
              创建
            </Button>
          </div>
        </Field>
        <Field>
          <FieldLabel for="managed-project">选择项目</FieldLabel>
          <Select
            :model-value="projectState.currentProjectId"
            :disabled="projectBusy || changingProject"
            @update:model-value="switchProject"
          >
            <SelectTrigger id="managed-project" class="w-full">
              <SelectValue placeholder="选择项目" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem
                  v-for="project in projectState.projects"
                  :key="project.id"
                  :value="project.id"
                >
                  {{ project.name }}
                </SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
          <FieldDescription>切换后将显示该项目的历史记录和管理操作。</FieldDescription>
        </Field>
        <Field>
          <FieldLabel>项目详情</FieldLabel>
          <div class="rounded-xl border p-3">
            <div class="flex items-center gap-2">
              <div class="min-w-0 flex-1">
                <Input
                  v-if="projectNameEditing"
                  v-model="editingProjectName"
                  class="h-7 text-sm font-medium"
                  maxlength="50"
                  aria-label="项目名称"
                  autofocus
                  @keydown.enter="renameCurrentProject"
                  @keydown.esc="cancelProjectNameEditing"
                />
                <button
                  v-else
                  type="button"
                  class="block max-w-full truncate rounded px-1 text-left text-sm font-medium hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  aria-label="编辑项目名称"
                  @click="editCurrentProjectName"
                >
                  {{ currentProject?.name }}
                </button>
              </div>
              <Button
                v-if="projectNameEditing"
                size="sm"
                :disabled="!editingProjectName.trim() || renamingProject || projectBusy"
                @click="renameCurrentProject"
              >
                <LoaderCircleIcon v-if="renamingProject" class="animate-spin" />
                保存
              </Button>
              <Button
                variant="destructive"
                size="sm"
                :disabled="projectState.projects.length === 1 || projectBusy || changingProject"
                @click="confirmDeleteProject"
              >
                <Trash2Icon data-icon="inline-start" />删除项目
              </Button>
            </div>
            <p class="mt-1 text-xs text-muted-foreground">{{ history.length }} 条历史记录</p>
          </div>
        </Field>
        <Field>
          <FieldLabel>迁移项目</FieldLabel>
          <div class="grid grid-cols-2 gap-2">
            <Button variant="outline" :disabled="projectBusy" @click="importProjectArchive">
              <LoaderCircleIcon
                v-if="importingProject"
                data-icon="inline-start"
                class="animate-spin"
              />
              <UploadCloudIcon v-else data-icon="inline-start" />导入项目
            </Button>
            <Button variant="outline" :disabled="projectBusy" @click="exportCurrentProject">
              <LoaderCircleIcon
                v-if="exportingProject"
                data-icon="inline-start"
                class="animate-spin"
              />
              <DownloadIcon v-else data-icon="inline-start" />导出项目
            </Button>
          </div>
        </Field>
      </FieldGroup>
    </DialogContent>
  </Dialog>

  <Dialog
    :open="Boolean(pendingDeleteProject)"
    @update:open="!$event && (pendingDeleteProject = null)"
  >
    <DialogContent :show-close-button="false">
      <DialogHeader>
        <DialogTitle>永久删除“{{ pendingDeleteProject?.name }}”？</DialogTitle>
      </DialogHeader>
      <DialogFooter>
        <Button variant="outline" :disabled="deletingProject" @click="pendingDeleteProject = null">
          取消
        </Button>
        <Button variant="destructive" :disabled="deletingProject" @click="deleteCurrentProject">
          <LoaderCircleIcon v-if="deletingProject" data-icon="inline-start" class="animate-spin" />
          永久删除
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>

  <Dialog :open="Boolean(flowCreation)" @update:open="!$event && (flowCreation = null)">
    <DialogContent class="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
      <DialogHeader>
        <DialogTitle>
          {{
            !flowCreation?.job
              ? '新建起始节点'
              : flowCreation.variant
                ? '生成节点变体'
                : '基于节点继续创作'
          }}
        </DialogTitle>
      </DialogHeader>
      <div v-if="flowCreation" class="flex flex-col gap-5">
        <div
          v-if="flowCreation.job"
          class="flex items-center gap-3 rounded-xl border bg-muted/20 p-3"
        >
          <img
            v-if="flowCreation.job.assets[0]"
            :src="flowCreation.job.assets[0].url"
            alt="来源节点图片"
            class="size-16 rounded-lg object-cover"
          />
          <div class="min-w-0">
            <Badge variant="secondary">来源节点</Badge>
            <p class="mt-1 line-clamp-2 text-xs text-muted-foreground">
              {{ flowCreation.job.prompt }}
            </p>
          </div>
        </div>
        <FieldGroup>
          <Field>
            <div class="flex items-center justify-between">
              <FieldLabel for="flow-prompt">提示词</FieldLabel>
              <Button variant="ghost" size="xs" type="button" @click="openPromptLibrary">
                <BookOpenIcon data-icon="inline-start" />提示词库
              </Button>
            </div>
            <Textarea
              id="flow-prompt"
              v-model="flowCreation.prompt"
              class="min-h-32 resize-none"
              :placeholder="
                flowCreation.job ? '描述希望基于当前节点继续生成的画面……' : '描述希望创建的画面……'
              "
            />
            <FieldDescription class="flex justify-end">
              <span>{{ flowCreation.prompt.length }}/32000</span>
            </FieldDescription>
          </Field>
          <Field v-if="flowCreation.job">
            <FieldLabel>当前节点前的参考图</FieldLabel>
            <div class="grid grid-cols-6 gap-2">
              <button
                v-for="asset in availableLeadingAssets"
                :key="asset.id"
                type="button"
                :class="[
                  'relative aspect-square overflow-hidden rounded-lg border bg-muted transition-colors disabled:pointer-events-none disabled:opacity-50',
                  isLeadingAssetSelected(asset)
                    ? 'border-primary ring-2 ring-primary/30'
                    : 'hover:border-primary/50'
                ]"
                :aria-pressed="isLeadingAssetSelected(asset)"
                @click="toggleLeadingAsset(asset)"
              >
                <img :src="asset.url" :alt="asset.name" class="size-full object-cover" />
                <Badge
                  v-if="flowReferenceOrder('leading-asset', asset.id)"
                  class="absolute left-1 top-1"
                >
                  {{ flowReferenceOrder('leading-asset', asset.id) }}
                </Badge>
                <Badge
                  v-if="isLeadingAssetSelected(asset)"
                  class="absolute bottom-1 left-1"
                  variant="secondary"
                >
                  <CircleCheckIcon />已选
                </Badge>
              </button>
              <div
                v-for="image in flowCreation.leadingReferences"
                :key="image.id"
                class="group relative aspect-square overflow-hidden rounded-lg border bg-muted"
              >
                <img :src="image.url" :alt="image.name" class="size-full object-cover" />
                <Badge class="absolute left-1 top-1">
                  {{ flowReferenceOrder('leading-reference', image.id) }}
                </Badge>
                <Button
                  variant="destructive"
                  size="icon-xs"
                  class="absolute right-1 top-1 opacity-0 group-hover:opacity-100"
                  aria-label="移除当前节点前的参考图"
                  @click="removeFlowReference(image.id, 'before')"
                >
                  <XIcon />
                </Button>
              </div>
              <button
                v-if="
                  flowCreation.leadingAssets.length +
                    flowCreation.leadingReferences.length +
                    flowCreation.references.length <
                  15
                "
                type="button"
                class="flex aspect-square items-center justify-center rounded-lg border border-dashed text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/5 hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
                aria-label="上传当前节点前的参考图片"
                @click="pickFlowReferences('before')"
              >
                <PlusIcon class="size-4" />
              </button>
            </div>
          </Field>
          <Field>
            <div class="flex items-center justify-between">
              <FieldLabel>{{ flowCreation.job ? '当前节点后的参考图' : '参考图片' }}</FieldLabel>
              <span class="text-xs text-muted-foreground">
                {{
                  flowCreation.references.length +
                  flowCreation.leadingAssets.length +
                  flowCreation.leadingReferences.length +
                  (flowCreation.job ? 1 : 0)
                }}/16
              </span>
            </div>
            <div class="grid grid-cols-6 gap-2">
              <div
                v-if="flowCreation.job"
                class="relative aspect-square overflow-hidden rounded-lg border bg-muted"
              >
                <img
                  v-if="flowCreation.job.assets[0]"
                  :src="flowCreation.job.assets[0].url"
                  alt="来源节点参考图"
                  class="size-full object-cover"
                />
                <Badge class="absolute left-1 top-1">
                  {{ flowReferenceOrder('source') }}
                </Badge>
                <Badge class="absolute bottom-1 left-1" variant="secondary">节点</Badge>
              </div>
              <div
                v-for="image in flowCreation.references"
                :key="image.id"
                class="group relative aspect-square overflow-hidden rounded-lg border bg-muted"
              >
                <img :src="image.url" :alt="image.name" class="size-full object-cover" />
                <Badge class="absolute left-1 top-1">
                  {{ flowReferenceOrder('reference', image.id) }}
                </Badge>
                <Button
                  variant="destructive"
                  size="icon-xs"
                  class="absolute right-1 top-1 opacity-0 group-hover:opacity-100"
                  aria-label="移除参考图"
                  @click="removeFlowReference(image.id)"
                >
                  <XIcon />
                </Button>
              </div>
              <button
                v-if="
                  flowCreation.references.length +
                    flowCreation.leadingAssets.length +
                    flowCreation.leadingReferences.length <
                  (flowCreation.job ? 15 : 16)
                "
                type="button"
                class="flex aspect-square items-center justify-center rounded-lg border border-dashed text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/5 hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
                aria-label="继续上传参考图片"
                @click="pickFlowReferences('after')"
              >
                <PlusIcon class="size-4" />
              </button>
            </div>
          </Field>
          <div class="grid grid-cols-3 gap-3">
            <Field>
              <FieldLabel>画幅</FieldLabel>
              <Select v-model="flowCreation.size">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="1024x1024">1:1</SelectItem>
                    <SelectItem value="1536x1024">3:2</SelectItem>
                    <SelectItem value="1024x1536">2:3</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>质量</FieldLabel>
              <Select v-model="flowCreation.quality">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="auto">自动</SelectItem>
                    <SelectItem value="low">低</SelectItem>
                    <SelectItem value="medium">中</SelectItem>
                    <SelectItem value="high">高</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>分支数量</FieldLabel>
              <Select v-model="flowCreation.n">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem v-for="count in 4" :key="count" :value="count">
                      {{ count }} 个分支
                    </SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          </div>
        </FieldGroup>
      </div>
      <DialogFooter>
        <Button variant="outline" @click="flowCreation = null"> 取消 </Button>
        <Button :disabled="!flowCreation?.prompt.trim()" @click="generateFromFlow">
          <SparklesIcon data-icon="inline-start" />
          生成并加入画布
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>

  <PromptLibraryDialog
    v-model:open="promptsOpen"
    :prompts="prompts"
    @select="fillPrompt"
    @create="createPrompt"
    @update="updatePrompt"
    @delete="deletePrompt"
  />

  <Dialog v-model:open="settingsOpen">
    <DialogContent class="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>连接设置</DialogTitle>
      </DialogHeader>
      <FieldGroup>
        <Field>
          <FieldLabel for="api-key">API Key</FieldLabel>
          <Input
            id="api-key"
            v-model="settingsForm.apiKey"
            type="password"
            :placeholder="settings.hasApiKey ? '已安全保存，输入可替换' : 'sk-…'"
          />
        </Field>
        <Field>
          <FieldLabel for="base-url">Base URL</FieldLabel>
          <Input
            id="base-url"
            v-model="settingsForm.baseUrl"
            placeholder="https://api.openai.com 或 https://api.openai.com/v1"
          />
        </Field>
        <Field>
          <FieldLabel for="model">模型名称</FieldLabel>
          <Input id="model" v-model="settingsForm.model" placeholder="gpt-image-2" />
        </Field>
        <Field>
          <FieldLabel>窗口背景</FieldLabel>
          <div class="flex items-center gap-2">
            <Button variant="outline" type="button" @click="pickWindowBackground">
              <ImageIcon data-icon="inline-start" />选择图片
            </Button>
            <Button
              v-if="settings.backgroundImageUrl"
              variant="ghost"
              type="button"
              @click="clearWindowBackground"
            >
              恢复默认
            </Button>
          </div>
        </Field>
      </FieldGroup>
      <Alert
        v-if="connectionFeedback"
        :variant="connectionFeedback.type === 'error' ? 'destructive' : 'default'"
      >
        <CircleAlertIcon v-if="connectionFeedback.type === 'error'" />
        <CircleCheckIcon v-else-if="connectionFeedback.type === 'success'" />
        <LoaderCircleIcon v-else class="animate-spin" />
        <AlertTitle>{{ connectionFeedback.title }}</AlertTitle>
        <AlertDescription>{{ connectionFeedback.message }}</AlertDescription>
      </Alert>
      <DialogFooter class="sm:justify-between">
        <Button
          v-if="settings.hasApiKey"
          variant="ghost"
          class="text-destructive"
          @click="clearCredential"
          >清除 Key</Button
        >
        <div class="ml-auto flex gap-2">
          <Button variant="outline" :disabled="testing" @click="testSettings">
            <LoaderCircleIcon
              v-if="testing"
              data-icon="inline-start"
              class="animate-spin"
            />测试连接
          </Button>
          <Button @click="saveSettings">保存设置</Button>
        </div>
      </DialogFooter>
    </DialogContent>
  </Dialog>

  <ImagePreview
    v-model:open="previewOpen"
    :assets="currentAssets"
    :asset-id="selectedAsset?.id"
    :image-size="selectedJob?.request.size"
    @select="selectPreviewAsset"
    @favorite="toggleFavorite"
    @variant="continueWithAsset($event, true)"
    @continue="continueWithAsset"
    @copy="copyAsset"
    @save="saveAsset"
  />

  <Toaster position="top-right" rich-colors />
</template>
