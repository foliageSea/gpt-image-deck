<script setup lang="ts">
import type {
  AppSettings,
  GeneratedAsset,
  GenerationJob,
  GenerationRequest,
  Project,
  ProjectState,
  ReferenceImage
} from '../../shared/image-types'
import {
  CopyIcon,
  DownloadIcon,
  FolderOpenIcon,
  GitBranchIcon,
  HeartIcon,
  HistoryIcon,
  ImageIcon,
  ImagesIcon,
  LoaderCircleIcon,
  FolderIcon,
  PlusIcon,
  RotateCcwIcon,
  Settings2Icon,
  SparklesIcon,
  Trash2Icon,
  UploadCloudIcon,
  WandSparklesIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  InfoIcon,
  XIcon
} from '@lucide/vue'
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import HistoryPanel from '@/components/HistoryPanel.vue'
import GenerationFlow from '@/components/GenerationFlow.vue'
import WindowControls from '@/components/WindowControls.vue'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from '@/components/ui/empty'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Slider } from '@/components/ui/slider'
import { Toaster } from '@/components/ui/sonner'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

const api = window.imageDeck
const isMac = api.windowControls.platform === 'darwin'
const settings = ref<AppSettings>({
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-image-2',
  hasApiKey: false,
  secureStorageAvailable: false
})
const settingsForm = reactive({ baseUrl: '', model: '', apiKey: '' })
const settingsOpen = ref(false)
const testing = ref(false)
const generating = ref(false)
const references = ref<ReferenceImage[]>([])
const projectState = ref<ProjectState>({ projects: [], currentProjectId: '' })
const projectsOpen = ref(false)
const projectName = ref('')
const creatingProject = ref(false)
const changingProject = ref(false)
const pendingDeleteProject = ref<Project | null>(null)
const deletingProject = ref(false)
const history = ref<GenerationJob[]>([])
const selectedJob = ref<GenerationJob | null>(null)
const selectedAsset = ref<GeneratedAsset | null>(null)
const previewOpen = ref(false)
const historyOpen = ref(false)
const flowOpen = ref(true)
const flowGenerating = ref(false)
const pendingDeleteJob = ref<GenerationJob | null>(null)
const pendingReuseJob = ref<GenerationJob | null>(null)
const deleting = ref(false)
type Feedback = { type: 'info' | 'success' | 'error'; title: string; message: string }
const generationFeedback = ref<Feedback | null>(null)
const connectionFeedback = ref<Feedback | null>(null)
type FlowCreation = {
  job?: GenerationJob
  variant: boolean
  prompt: string
  size: string
  quality: GenerationRequest['quality']
  n: number
  references: ReferenceImage[]
}
const flowCreation = ref<FlowCreation | null>(null)

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

const canGenerate = computed(
  () => Boolean(form.projectId) && form.prompt.trim().length > 0 && !generating.value
)
const projectBusy = computed(() => generating.value || flowGenerating.value)
const currentProject = computed(() =>
  projectState.value.projects.find((project) => project.id === projectState.value.currentProjectId)
)
const currentAssets = computed(() => selectedJob.value?.assets ?? [])
const favoriteAssets = computed(() => currentAssets.value.filter((asset) => asset.favorite))
const compressionSlider = computed({
  get: () => [form.compression],
  set: (value: number[]) => {
    form.compression = value[0] ?? 90
  }
})

watch(
  () => form.format,
  (format) => {
    if (format === 'jpeg' && form.background === 'transparent') {
      form.background = 'auto'
      toast.info('JPEG 不支持透明背景，已切换为自动背景。')
    }
  }
)

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value))
}

function formatBytes(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.round(bytes / 1024)} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

async function load(): Promise<void> {
  try {
    const [nextSettings, nextProjects] = await Promise.all([api.getSettings(), api.getProjects()])
    const nextHistory = await api.listHistory(nextProjects.currentProjectId)
    settings.value = nextSettings
    projectState.value = nextProjects
    form.projectId = nextProjects.currentProjectId
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
  references.value = []
  form.referenceIds = []
  form.parentJobId = undefined
  form.sourceAssetId = undefined
  flowCreation.value = null
  pendingReuseJob.value = null
}

async function applyProjectState(next: ProjectState): Promise<void> {
  projectState.value = next
  form.projectId = next.currentProjectId
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

async function pickReferences(): Promise<void> {
  try {
    const picked = await api.pickReferenceImages()
    const merged = [...references.value, ...picked].slice(0, 16)
    references.value = merged
    form.referenceIds = merged.map((item) => item.id)
  } catch (error) {
    toast.error(error instanceof Error ? error.message : '参考图片读取失败。')
  }
}

function removeReference(id: string): void {
  references.value = references.value.filter((item) => item.id !== id)
  form.referenceIds = references.value.map((item) => item.id)
}

async function generate(): Promise<void> {
  if (!settings.value.hasApiKey) {
    generationFeedback.value = {
      type: 'error',
      title: '尚未配置 API Key',
      message: '请先在连接设置中保存 API Key。'
    }
    settingsOpen.value = true
    toast.info('请先配置 API Key。')
    return
  }
  if (!canGenerate.value) return
  generating.value = true
  generationFeedback.value = {
    type: 'info',
    title: '请求已发送',
    message: '正在等待图片接口返回结果，生成过程可能需要几分钟。'
  }
  try {
    const result = await api.generate({ ...form, referenceIds: [...form.referenceIds] })
    if (!result.success) {
      generationFeedback.value = { type: 'error', title: '生成失败', message: result.message }
      toast.error(result.message, { duration: 8000 })
      return
    }
    const job = result.job
    if (job.projectId === projectState.value.currentProjectId) {
      history.value.unshift(job)
      selectJob(job)
    }
    generationFeedback.value = {
      type: 'success',
      title: '生成完成',
      message: `已收到 ${job.assets.length} 张图片并保存到本地历史。`
    }
    toast.success(
      job.projectId === projectState.value.currentProjectId
        ? job.status === 'partial'
          ? '图片已部分生成。'
          : '图片生成完成。'
        : '图片生成完成，已保存到原项目。'
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : '图片生成失败。'
    generationFeedback.value = { type: 'error', title: '生成失败', message }
    toast.error(message, { duration: 8000 })
  } finally {
    generating.value = false
  }
}

function selectJob(job: GenerationJob | null): void {
  selectedJob.value = job
  selectedAsset.value = job?.assets[0] ?? null
}

function applyJobParameters(job: GenerationJob, keepReferences: boolean): void {
  form.prompt = job.prompt
  form.n = job.request.n
  form.size = job.request.size
  form.quality = job.request.quality
  form.format = job.request.format
  form.compression = job.request.compression
  form.background = job.request.background
  form.inputFidelity = job.request.inputFidelity
  form.parentJobId = job.id
  form.sourceAssetId = undefined
  if (!keepReferences) {
    references.value = []
    form.referenceIds = []
  }
  pendingReuseJob.value = null
  historyOpen.value = false
  toast.success(
    job.request.referenceCount
      ? '提示词和输出参数已载入，请重新选择原参考图片。'
      : '提示词和参数已载入。'
  )
}

async function continueWithAsset(
  asset: GeneratedAsset,
  variant = false,
  sourceJob = selectedJob.value
): Promise<void> {
  if (!sourceJob) return
  try {
    const reference = await api.useAssetAsReference(asset.id)
    references.value = [reference]
    form.referenceIds = [reference.id]
    form.parentJobId = sourceJob.id
    form.sourceAssetId = asset.id
    form.inputFidelity = variant ? 'low' : 'high'
    form.prompt = sourceJob.prompt
    selectJob(sourceJob)
    previewOpen.value = false
    historyOpen.value = false
    flowOpen.value = false
    toast.success(variant ? '已准备生成变体，可调整提示词后生成。' : '已加入创作链。')
  } catch (error) {
    toast.error(error instanceof Error ? error.message : '无法继续创作。')
  }
}

function continueFromHistory(job: GenerationJob, variant: boolean): void {
  const asset = job.assets[0]
  if (asset) void continueWithAsset(asset, variant, job)
}

function openFlow(): void {
  historyOpen.value = false
  flowOpen.value = true
}

function selectFlowJob(job: GenerationJob): void {
  selectJob(job)
}

function openFlowCreation(job: GenerationJob, variant: boolean): void {
  flowCreation.value = {
    job,
    variant,
    prompt: job.prompt,
    size: job.request.size,
    quality: job.request.quality,
    n: job.request.n,
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
    references: []
  }
}

async function pickFlowReferences(): Promise<void> {
  const creation = flowCreation.value
  if (!creation) return
  try {
    const picked = await api.pickReferenceImages()
    const existingIds = new Set(creation.references.map((item) => item.id))
    const unique = picked.filter((item) => !existingIds.has(item.id))
    creation.references = [...creation.references, ...unique].slice(0, creation.job ? 15 : 16)
  } catch (error) {
    toast.error(error instanceof Error ? error.message : '参考图片读取失败。')
  }
}

function removeFlowReference(id: string): void {
  if (!flowCreation.value) return
  flowCreation.value.references = flowCreation.value.references.filter((item) => item.id !== id)
}

async function generateFromFlow(): Promise<void> {
  const creation = flowCreation.value
  const asset = creation?.job?.assets[0]
  if (!creation || (creation.job && !asset) || !creation.prompt.trim() || flowGenerating.value)
    return
  if (!settings.value.hasApiKey) {
    settingsOpen.value = true
    toast.info('请先配置 API Key。')
    return
  }

  flowGenerating.value = true
  try {
    const sourceReference = asset ? await api.useAssetAsReference(asset.id) : null
    const result = await api.generate({
      projectId: projectState.value.currentProjectId,
      prompt: creation.prompt.trim(),
      referenceIds: [
        ...(sourceReference ? [sourceReference.id] : []),
        ...creation.references.map((item) => item.id)
      ],
      parentJobId: creation.job?.id,
      sourceAssetId: asset?.id,
      n: creation.n,
      size: creation.size,
      quality: creation.quality,
      format: creation.job?.request.format ?? form.format,
      compression: creation.job?.request.compression ?? form.compression,
      background: creation.job?.request.background ?? form.background,
      inputFidelity: creation.job ? (creation.variant ? 'low' : 'high') : form.inputFidelity
    })
    if (!result.success) {
      toast.error(result.message, { duration: 8000 })
      return
    }
    if (result.job.projectId === projectState.value.currentProjectId) {
      history.value.unshift(result.job)
      selectJob(result.job)
    }
    flowCreation.value = null
    toast.success(creation.variant ? '变体已加入创作流程。' : '新节点已加入创作流程。')
  } catch (error) {
    toast.error(error instanceof Error ? error.message : '流程节点生成失败。', { duration: 8000 })
  } finally {
    flowGenerating.value = false
  }
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

async function saveAssets(assets: GeneratedAsset[]): Promise<void> {
  try {
    const result = await api.saveAssets(assets.map((asset) => asset.id))
    if (result.message) result.success ? toast.success(result.message) : toast.info(result.message)
  } catch (error) {
    toast.error(error instanceof Error ? error.message : '批量导出失败。')
  }
}

async function copyPrompt(): Promise<void> {
  if (!selectedJob.value) return
  try {
    await navigator.clipboard.writeText(selectedJob.value.prompt)
    toast.success('提示词已复制。')
  } catch {
    toast.error('提示词复制失败。')
  }
}

function resetParameters(): void {
  form.n = 1
  form.size = '1024x1024'
  form.quality = 'auto'
  form.format = 'png'
  form.compression = 90
  form.background = 'auto'
  form.inputFidelity = 'low'
  toast.success('输出参数已重置。')
}

function reuseJob(job: GenerationJob): void {
  if (references.value.length || job.request.referenceCount) {
    pendingReuseJob.value = job
    return
  }
  applyJobParameters(job, false)
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

function selectHistoryJob(job: GenerationJob): void {
  selectJob(job)
  historyOpen.value = false
}

async function saveAsset(asset: GeneratedAsset): Promise<void> {
  try {
    const result = await api.saveAsset(asset.id)
    if (result.success) toast.success(result.message ?? '图片已保存。')
  } catch (error) {
    toast.error(error instanceof Error ? error.message : '保存失败。')
  }
}

function openPreview(asset: GeneratedAsset): void {
  selectedAsset.value = asset
  previewOpen.value = true
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

onMounted(load)
</script>

<template>
  <GenerationFlow
    v-if="flowOpen"
    :history="history"
    :projects="projectState.projects"
    :current-project-id="projectState.currentProjectId"
    :selected-job-id="selectedJob?.id"
    :project-busy="projectBusy || changingProject"
    @close="flowOpen = false"
    @select="selectFlowJob"
    @create="openFlowCreation"
    @create-root="openNewFlowCreation"
    @switch-project="switchProject"
    @manage-projects="projectsOpen = true"
    @delete="pendingDeleteJob = $event"
  />
  <div v-else class="flex h-screen flex-col bg-background">
    <header
      :class="[
        'flex h-14 shrink-0 items-center border-b bg-card/70 backdrop-blur-xl [-webkit-app-region:drag]',
        isMac ? 'pl-24' : 'pl-4'
      ]"
    >
      <div class="flex items-center gap-3">
        <div
          class="flex size-8 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/15"
        >
          <WandSparklesIcon />
        </div>
        <div class="hidden sm:block">
          <h1 class="text-sm font-semibold tracking-tight">Image Deck</h1>
          <p class="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            GPT Image Studio
          </p>
        </div>
      </div>
      <div
        :class="[
          'ml-auto flex h-full items-center gap-2 [-webkit-app-region:no-drag]',
          isMac && 'pr-3'
        ]"
      >
        <Select
          :model-value="projectState.currentProjectId"
          :disabled="changingProject || projectBusy"
          @update:model-value="switchProject"
        >
          <SelectTrigger class="w-32 sm:w-40" aria-label="当前项目">
            <FolderIcon />
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
        <Button
          variant="ghost"
          size="icon"
          aria-label="管理项目"
          :disabled="projectBusy"
          @click="projectsOpen = true"
        >
          <PlusIcon />
        </Button>
        <Button variant="secondary" size="sm" aria-label="切换到流程创造模式" @click="openFlow">
          <GitBranchIcon data-icon="inline-start" />流程模式
        </Button>
        <Button
          variant="ghost"
          size="sm"
          class="xl:hidden"
          aria-label="打开历史记录"
          @click="historyOpen = true"
        >
          <HistoryIcon data-icon="inline-start" />历史
        </Button>
        <Badge
          :variant="settings.hasApiKey ? 'secondary' : 'outline'"
          class="hidden gap-1.5 md:flex"
        >
          <span
            :class="[
              'size-1.5 rounded-full',
              settings.hasApiKey ? 'bg-primary' : 'bg-muted-foreground'
            ]"
          />
          {{ settings.hasApiKey ? 'Key 已保存' : '未配置 Key' }}
        </Badge>
        <Button variant="ghost" size="icon" aria-label="连接设置" @click="settingsOpen = true">
          <Settings2Icon />
        </Button>
        <WindowControls :class="!isMac && 'ml-1'" />
      </div>
    </header>

    <main
      class="grid min-h-0 flex-1 grid-cols-[320px_minmax(0,1fr)_280px] max-xl:grid-cols-[300px_minmax(0,1fr)]"
    >
      <aside class="flex min-h-0 flex-col border-r bg-card/35">
        <ScrollArea class="min-h-0 flex-1">
          <div class="flex flex-col gap-6 p-4">
            <div>
              <p class="text-xs font-medium uppercase tracking-[0.18em] text-primary">Create</p>
              <h2 class="mt-1 text-xl font-semibold tracking-tight">构建你的画面</h2>
              <p class="mt-1 text-xs text-muted-foreground">描述想法，添加参考，然后生成。</p>
            </div>

            <FieldGroup>
              <Field>
                <FieldLabel for="prompt">提示词</FieldLabel>
                <Textarea
                  id="prompt"
                  v-model="form.prompt"
                  class="min-h-36 resize-none"
                  placeholder="一张电影感的产品照片，柔和侧光，深色背景，精致材质细节……"
                  :aria-invalid="!form.prompt.trim() && form.prompt.length > 0"
                />
                <FieldDescription class="flex justify-between">
                  <span>支持中英文自然语言</span>
                  <span>{{ form.prompt.length }}/32000</span>
                </FieldDescription>
              </Field>

              <Field>
                <div class="flex items-center justify-between">
                  <FieldLabel>参考图片</FieldLabel>
                  <span class="text-xs text-muted-foreground">{{ references.length }}/16</span>
                </div>
                <button
                  type="button"
                  class="flex min-h-24 w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-muted/20 text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/5 hover:text-foreground"
                  @click="pickReferences"
                >
                  <UploadCloudIcon class="size-5" />
                  <span class="text-xs font-medium">选择 PNG、JPG 或 WebP</span>
                </button>
                <div v-if="references.length" class="grid grid-cols-4 gap-2">
                  <div
                    v-for="image in references"
                    :key="image.id"
                    class="group relative aspect-square overflow-hidden rounded-lg border bg-muted"
                  >
                    <img :src="image.url" :alt="image.name" class="size-full object-cover" />
                    <Button
                      variant="destructive"
                      size="icon-xs"
                      class="absolute right-1 top-1 opacity-0 group-hover:opacity-100"
                      aria-label="移除参考图"
                      @click="removeReference(image.id)"
                    >
                      <XIcon />
                    </Button>
                  </div>
                  <button
                    v-if="references.length < 16"
                    type="button"
                    class="flex aspect-square items-center justify-center rounded-lg border border-dashed text-muted-foreground hover:text-foreground"
                    @click="pickReferences"
                  >
                    <PlusIcon class="size-4" />
                  </button>
                </div>
              </Field>

              <Field>
                <div class="flex items-center justify-between">
                  <FieldLabel>画幅</FieldLabel>
                  <Button variant="ghost" size="xs" type="button" @click="resetParameters">
                    <RotateCcwIcon data-icon="inline-start" />重置参数
                  </Button>
                </div>
                <ToggleGroup
                  v-model="form.size"
                  type="single"
                  variant="outline"
                  class="grid grid-cols-3"
                >
                  <ToggleGroupItem value="1024x1024">1:1</ToggleGroupItem>
                  <ToggleGroupItem value="1536x1024">3:2</ToggleGroupItem>
                  <ToggleGroupItem value="1024x1536">2:3</ToggleGroupItem>
                </ToggleGroup>
              </Field>

              <div class="grid grid-cols-2 gap-3">
                <Field>
                  <FieldLabel>质量</FieldLabel>
                  <Select v-model="form.quality">
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
                  <FieldLabel>格式</FieldLabel>
                  <Select v-model="form.format">
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="png">PNG</SelectItem>
                        <SelectItem value="jpeg">JPEG</SelectItem>
                        <SelectItem value="webp">WebP</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              <div class="grid grid-cols-2 gap-3">
                <Field>
                  <FieldLabel>背景</FieldLabel>
                  <Select v-model="form.background">
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="auto">自动</SelectItem>
                        <SelectItem value="opaque">不透明</SelectItem>
                        <SelectItem value="transparent" :disabled="form.format === 'jpeg'"
                          >透明</SelectItem
                        >
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel>数量</FieldLabel>
                  <Select v-model="form.n">
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem v-for="count in 4" :key="count" :value="count"
                          >{{ count }} 张</SelectItem
                        >
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              <Field v-if="form.format !== 'png'">
                <div class="flex items-center justify-between">
                  <FieldLabel>输出压缩</FieldLabel>
                  <span class="text-xs text-muted-foreground">{{ form.compression }}%</span>
                </div>
                <Slider v-model="compressionSlider" :min="0" :max="100" :step="5" />
              </Field>

              <Field v-if="references.length">
                <FieldLabel>参考保真度</FieldLabel>
                <ToggleGroup
                  v-model="form.inputFidelity"
                  type="single"
                  variant="outline"
                  class="grid grid-cols-2"
                >
                  <ToggleGroupItem value="low">灵活创作</ToggleGroupItem>
                  <ToggleGroupItem value="high">高度还原</ToggleGroupItem>
                </ToggleGroup>
              </Field>
            </FieldGroup>

            <Alert
              v-if="generationFeedback"
              :variant="generationFeedback.type === 'error' ? 'destructive' : 'default'"
            >
              <CircleAlertIcon v-if="generationFeedback.type === 'error'" />
              <CircleCheckIcon v-else-if="generationFeedback.type === 'success'" />
              <InfoIcon v-else />
              <AlertTitle>{{ generationFeedback.title }}</AlertTitle>
              <AlertDescription>{{ generationFeedback.message }}</AlertDescription>
            </Alert>
          </div>
        </ScrollArea>
        <div class="shrink-0 border-t bg-card/90 p-4 backdrop-blur-xl">
          <Button size="lg" class="w-full" :disabled="!canGenerate" @click="generate">
            <LoaderCircleIcon v-if="generating" data-icon="inline-start" class="animate-spin" />
            <SparklesIcon v-else data-icon="inline-start" />
            {{ generating ? '正在生成…' : references.length ? '编辑图片' : '生成图片' }}
          </Button>
        </div>
      </aside>

      <section
        class="relative min-h-0 overflow-hidden bg-[radial-gradient(circle_at_top,var(--color-muted),transparent_45%)]"
      >
        <div
          class="absolute inset-0 opacity-[0.035] [background-image:linear-gradient(var(--foreground)_1px,transparent_1px),linear-gradient(90deg,var(--foreground)_1px,transparent_1px)] [background-size:32px_32px]"
        />
        <ScrollArea class="relative h-full">
          <div class="flex min-h-[calc(100vh-3.5rem)] flex-col p-6 lg:p-10">
            <div
              v-if="generating && !currentAssets.length"
              class="m-auto grid w-full max-w-3xl grid-cols-2 gap-4"
            >
              <Skeleton v-for="index in form.n" :key="index" class="aspect-square rounded-2xl" />
              <div class="col-span-full mt-3 text-center">
                <p class="text-sm font-medium">正在构建画面</p>
                <p class="mt-1 text-xs text-muted-foreground">
                  高质量图片可能需要一些时间，请保持应用开启。
                </p>
              </div>
            </div>

            <Empty v-else-if="!currentAssets.length" class="m-auto max-w-md border-none">
              <EmptyHeader>
                <EmptyMedia variant="icon"><ImageIcon /></EmptyMedia>
                <EmptyTitle>从一个想法开始</EmptyTitle>
                <EmptyDescription
                  >输入提示词并设置画幅。生成结果会出现在这块画布中，并自动保存到历史。</EmptyDescription
                >
              </EmptyHeader>
              <EmptyContent>
                <Button
                  variant="outline"
                  @click="
                    form.prompt = '一座悬浮在晨雾中的未来图书馆，建筑摄影，柔和自然光，超精细细节'
                  "
                >
                  <SparklesIcon data-icon="inline-start" />使用示例提示词
                </Button>
              </EmptyContent>
            </Empty>

            <div v-else class="m-auto w-full max-w-5xl">
              <Alert v-if="generating" class="mb-5">
                <LoaderCircleIcon class="animate-spin" />
                <AlertTitle>正在生成新作品</AlertTitle>
                <AlertDescription>
                  当前作品仍可预览和保存，新结果返回后会自动切换。
                </AlertDescription>
              </Alert>
              <div class="mb-5 flex items-end justify-between gap-4">
                <div class="min-w-0">
                  <div class="mb-2 flex items-center gap-2">
                    <Badge variant="secondary">{{ selectedJob?.assets.length }} 张图片</Badge>
                    <Badge v-if="selectedJob?.parentJobId" variant="outline" class="gap-1">
                      <GitBranchIcon class="size-3" />衍生版本
                    </Badge>
                    <span class="text-xs text-muted-foreground">{{
                      selectedJob && formatDate(selectedJob.createdAt)
                    }}</span>
                  </div>
                  <p class="line-clamp-2 max-w-2xl text-sm text-muted-foreground">
                    {{ selectedJob?.prompt }}
                  </p>
                </div>
                <div class="flex shrink-0 flex-wrap justify-end gap-2">
                  <Button variant="outline" size="sm" @click="copyPrompt">
                    <CopyIcon data-icon="inline-start" />复制提示词
                  </Button>
                  <Button
                    v-if="favoriteAssets.length"
                    variant="outline"
                    size="sm"
                    @click="saveAssets(favoriteAssets)"
                  >
                    <HeartIcon data-icon="inline-start" />导出收藏
                  </Button>
                  <Button variant="outline" size="sm" @click="saveAssets(currentAssets)">
                    <ImagesIcon data-icon="inline-start" />批量导出
                  </Button>
                  <Button variant="outline" size="sm" @click="selectedJob && reuseJob(selectedJob)">
                    <RotateCcwIcon data-icon="inline-start" />复用参数
                  </Button>
                </div>
              </div>
              <div
                :class="[
                  'grid gap-4',
                  currentAssets.length === 1
                    ? 'h-[calc(100dvh-15rem)] min-h-80 grid-cols-1'
                    : 'grid-cols-2'
                ]"
              >
                <Card
                  v-for="asset in currentAssets"
                  :key="asset.id"
                  :class="[
                    'group overflow-hidden rounded-none py-0',
                    currentAssets.length === 1 && 'flex h-full min-h-0 flex-col'
                  ]"
                >
                  <button
                    :class="[
                      'relative block w-full overflow-hidden bg-muted',
                      currentAssets.length === 1 ? 'min-h-0 flex-1' : 'aspect-square'
                    ]"
                    @click="openPreview(asset)"
                  >
                    <img
                      :src="asset.url"
                      :alt="asset.name"
                      class="size-full object-contain transition-transform duration-500 group-hover:scale-[1.02]"
                      draggable="false"
                    />
                    <div
                      class="absolute inset-x-0 bottom-0 flex translate-y-full items-center justify-between bg-background/80 p-3 backdrop-blur-md transition-transform group-hover:translate-y-0"
                    >
                      <span class="text-xs text-muted-foreground">{{
                        formatBytes(asset.size)
                      }}</span>
                      <span class="text-xs font-medium">点击预览</span>
                    </div>
                  </button>
                  <div class="flex items-center justify-between p-3">
                    <span class="truncate text-xs text-muted-foreground">{{ asset.name }}</span>
                    <div class="flex items-center gap-1">
                      <Button
                        :variant="asset.favorite ? 'secondary' : 'ghost'"
                        size="icon-sm"
                        :aria-label="asset.favorite ? '取消收藏' : '收藏图片'"
                        @click="toggleFavorite(asset)"
                      >
                        <HeartIcon :class="asset.favorite && 'fill-current'" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="基于图片继续创作"
                        @click="continueWithAsset(asset)"
                      >
                        <GitBranchIcon />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="保存图片"
                        @click="saveAsset(asset)"
                        ><DownloadIcon
                      /></Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="在文件夹中显示"
                        @click="api.showAsset(asset.id)"
                        ><FolderOpenIcon
                      /></Button>
                    </div>
                  </div>
                </Card>
              </div>
            </div>
          </div>
        </ScrollArea>
      </section>

      <aside class="min-h-0 border-l bg-card/35 max-xl:hidden">
        <HistoryPanel
          :history="history"
          :selected-job-id="selectedJob?.id"
          @select="selectHistoryJob"
          @reuse="reuseJob"
          @delete="pendingDeleteJob = $event"
          @continue="continueFromHistory"
          @open-flow="openFlow"
        />
      </aside>
    </main>
  </div>

  <Sheet v-model:open="historyOpen">
    <SheetContent class="gap-0 p-0" side="right">
      <SheetHeader class="sr-only">
        <SheetTitle>历史记录</SheetTitle>
        <SheetDescription>查看、复用或删除历史生成任务。</SheetDescription>
      </SheetHeader>
      <HistoryPanel
        :history="history"
        :selected-job-id="selectedJob?.id"
        @select="selectHistoryJob"
        @reuse="reuseJob"
        @delete="pendingDeleteJob = $event"
        @continue="continueFromHistory"
        @open-flow="openFlow"
      />
    </SheetContent>
  </Sheet>

  <Dialog :open="Boolean(pendingReuseJob)" @update:open="!$event && (pendingReuseJob = null)">
    <DialogContent :show-close-button="false">
      <DialogHeader>
        <DialogTitle>复用这次创作？</DialogTitle>
        <DialogDescription>
          <template v-if="pendingReuseJob?.request.referenceCount">
            这次任务使用了 {{ pendingReuseJob.request.referenceCount }}
            张参考图。原参考图尚未保存在历史中，载入后需要重新选择。
          </template>
          <template v-else-if="references.length">
            当前已选择
            {{ references.length }} 张参考图。建议清空，避免把文生图任务意外变成图片编辑。
          </template>
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button variant="outline" @click="pendingReuseJob = null">取消</Button>
        <Button
          v-if="pendingReuseJob && references.length"
          variant="secondary"
          @click="applyJobParameters(pendingReuseJob, true)"
        >
          保留当前参考图
        </Button>
        <Button v-if="pendingReuseJob" @click="applyJobParameters(pendingReuseJob, false)">
          清空参考图并载入
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>

  <Dialog :open="Boolean(pendingDeleteJob)" @update:open="!$event && (pendingDeleteJob = null)">
    <DialogContent :show-close-button="false">
      <DialogHeader>
        <DialogTitle>永久删除这条历史？</DialogTitle>
        <DialogDescription>
          任务中的 {{ pendingDeleteJob?.assets.length ?? 0 }} 张本地图片也会被删除，此操作无法撤销。
        </DialogDescription>
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
        <DialogDescription>每个项目拥有独立的历史记录和创作流程。</DialogDescription>
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
          <FieldLabel>当前项目</FieldLabel>
          <div class="flex items-center justify-between gap-3 rounded-xl border p-3">
            <div class="min-w-0">
              <p class="truncate text-sm font-medium">{{ currentProject?.name }}</p>
              <p class="text-xs text-muted-foreground">{{ history.length }} 条历史记录</p>
            </div>
            <Button
              variant="destructive"
              size="sm"
              :disabled="projectState.projects.length === 1"
              @click="confirmDeleteProject"
            >
              <Trash2Icon data-icon="inline-start" />删除项目
            </Button>
          </div>
          <FieldDescription v-if="projectState.projects.length === 1">
            至少需要保留一个项目。
          </FieldDescription>
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
        <DialogDescription>
          该项目中的历史记录和本地图片将一并删除，此操作无法撤销。
        </DialogDescription>
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

  <Dialog
    :open="Boolean(flowCreation)"
    @update:open="!$event && !flowGenerating && (flowCreation = null)"
  >
    <DialogContent
      class="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl"
      :show-close-button="!flowGenerating"
    >
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
        <DialogDescription>
          {{
            flowCreation?.job
              ? '当前图片会作为参考，生成结果将自动连接到该节点并保留在流程画布中。'
              : '从提示词创建一组图片，并作为独立的起始节点加入当前流程。'
          }}
        </DialogDescription>
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
            <FieldLabel for="flow-prompt">提示词</FieldLabel>
            <Textarea
              id="flow-prompt"
              v-model="flowCreation.prompt"
              class="min-h-32 resize-none"
              :placeholder="
                flowCreation.job ? '描述希望基于当前节点继续生成的画面……' : '描述希望创建的画面……'
              "
              :disabled="flowGenerating"
            />
            <FieldDescription class="flex justify-between">
              <span>
                {{
                  !flowCreation.job
                    ? '创建一个新的流程起点'
                    : flowCreation.variant
                      ? '灵活生成相似变体'
                      : '高度还原来源图片'
                }}
              </span>
              <span>{{ flowCreation.prompt.length }}/32000</span>
            </FieldDescription>
          </Field>
          <Field>
            <div class="flex items-center justify-between">
              <FieldLabel>参考图片</FieldLabel>
              <span class="text-xs text-muted-foreground">
                {{ flowCreation.references.length + (flowCreation.job ? 1 : 0) }}/16
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
                <Badge class="absolute bottom-1 left-1" variant="secondary">节点</Badge>
              </div>
              <div
                v-for="image in flowCreation.references"
                :key="image.id"
                class="group relative aspect-square overflow-hidden rounded-lg border bg-muted"
              >
                <img :src="image.url" :alt="image.name" class="size-full object-cover" />
                <Button
                  variant="destructive"
                  size="icon-xs"
                  class="absolute right-1 top-1 opacity-0 group-hover:opacity-100"
                  :disabled="flowGenerating"
                  aria-label="移除参考图"
                  @click="removeFlowReference(image.id)"
                >
                  <XIcon />
                </Button>
              </div>
              <button
                v-if="flowCreation.references.length < (flowCreation.job ? 15 : 16)"
                type="button"
                class="flex aspect-square items-center justify-center rounded-lg border border-dashed text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/5 hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
                :disabled="flowGenerating"
                aria-label="继续上传参考图片"
                @click="pickFlowReferences"
              >
                <PlusIcon class="size-4" />
              </button>
            </div>
            <FieldDescription>
              {{
                flowCreation.job
                  ? '来源节点固定作为第一张参考图，可继续添加 PNG、JPG 或 WebP。'
                  : '可添加 PNG、JPG 或 WebP 作为新节点的参考图片。'
              }}
            </FieldDescription>
          </Field>
          <div class="grid grid-cols-3 gap-3">
            <Field>
              <FieldLabel>画幅</FieldLabel>
              <Select v-model="flowCreation.size" :disabled="flowGenerating">
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
              <Select v-model="flowCreation.quality" :disabled="flowGenerating">
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
              <FieldLabel>数量</FieldLabel>
              <Select v-model="flowCreation.n" :disabled="flowGenerating">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem v-for="count in 4" :key="count" :value="count">
                      {{ count }} 张
                    </SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          </div>
        </FieldGroup>
      </div>
      <DialogFooter>
        <Button variant="outline" :disabled="flowGenerating" @click="flowCreation = null">
          取消
        </Button>
        <Button
          :disabled="!flowCreation?.prompt.trim() || flowGenerating"
          @click="generateFromFlow"
        >
          <LoaderCircleIcon v-if="flowGenerating" data-icon="inline-start" class="animate-spin" />
          <SparklesIcon v-else data-icon="inline-start" />
          {{ flowGenerating ? '正在生成…' : '生成并加入流程' }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>

  <Dialog v-model:open="settingsOpen">
    <DialogContent class="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>连接设置</DialogTitle>
        <DialogDescription
          >连接 OpenAI 官方接口或兼容的 Images API。API Key 不会进入页面上下文。</DialogDescription
        >
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
          <FieldDescription>
            {{
              settings.secureStorageAvailable
                ? '将使用系统安全存储加密。'
                : '系统安全存储不可用，将仅保留到应用退出。'
            }}
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel for="base-url">Base URL</FieldLabel>
          <Input
            id="base-url"
            v-model="settingsForm.baseUrl"
            placeholder="https://api.openai.com 或 https://api.openai.com/v1"
          />
          <FieldDescription v-if="settingsForm.baseUrl.trim().startsWith('http://')">
            当前使用未加密的 HTTP 连接，请仅连接可信网络中的服务。
          </FieldDescription>
          <FieldDescription v-else>
            生图请求固定使用 /v1/images/generations；末尾的 /v1 可省略。
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel for="model">模型名称</FieldLabel>
          <Input id="model" v-model="settingsForm.model" placeholder="gpt-image-2" />
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

  <Dialog v-model:open="previewOpen">
    <DialogContent
      class="flex h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-none items-center justify-center border-none bg-transparent p-0 shadow-none sm:max-w-none"
      :close-on-overlay-click="true"
      @close="previewOpen = false"
      @click.self="previewOpen = false"
    >
      <DialogHeader class="sr-only"
        ><DialogTitle>图片预览</DialogTitle
        ><DialogDescription>查看生成结果</DialogDescription></DialogHeader
      >
      <img
        v-if="selectedAsset"
        :src="selectedAsset.url"
        :alt="selectedAsset.name"
        class="h-auto max-h-full w-auto max-w-full object-contain"
        draggable="false"
      />
      <div v-if="selectedAsset" class="absolute bottom-4 right-4 flex flex-wrap justify-end gap-2">
        <Button variant="secondary" @click="toggleFavorite(selectedAsset)">
          <HeartIcon data-icon="inline-start" :class="selectedAsset.favorite && 'fill-current'" />
          {{ selectedAsset.favorite ? '已收藏' : '收藏' }}
        </Button>
        <Button variant="secondary" @click="continueWithAsset(selectedAsset, true)">
          <SparklesIcon data-icon="inline-start" />生成变体
        </Button>
        <Button @click="continueWithAsset(selectedAsset)">
          <GitBranchIcon data-icon="inline-start" />继续创作
        </Button>
        <Button @click="saveAsset(selectedAsset)">
          <DownloadIcon data-icon="inline-start" />保存图片
        </Button>
      </div>
    </DialogContent>
  </Dialog>

  <Toaster position="top-right" rich-colors />
</template>
