import type {
  GeneratedAsset,
  GenerationJob,
  GenerationRequest,
  Project,
  ProjectState
} from '../../../shared/image-types'
import type { PendingFlowGeneration } from '@/types/app'
import type { ComputedRef, Ref } from 'vue'
import { computed, ref, watch } from 'vue'
import { toast } from 'vue-sonner'

export type ProjectWorkspaceController = {
  projectState: Ref<ProjectState>
  projectsOpen: Ref<boolean>
  projectName: Ref<string>
  editingProjectName: Ref<string>
  projectNameEditing: Ref<boolean>
  creatingProject: Ref<boolean>
  renamingProject: Ref<boolean>
  changingProject: Ref<boolean>
  pendingDeleteProject: Ref<Project | null>
  deletingProject: Ref<boolean>
  exportingProject: Ref<boolean>
  importingProject: Ref<boolean>
  history: Ref<GenerationJob[]>
  selectedJob: Ref<GenerationJob | null>
  selectedAsset: Ref<GeneratedAsset | null>
  previewOpen: Ref<boolean>
  pendingDeleteJob: Ref<GenerationJob | null>
  deletingJob: Ref<boolean>
  currentProject: ComputedRef<Project | undefined>
  currentAssets: ComputedRef<GeneratedAsset[]>
  projectTransferBusy: ComputedRef<boolean>
  initialize: (nextProjects: ProjectState, nextHistory: GenerationJob[]) => void
  switchProject: (projectId: unknown) => Promise<void>
  createProject: () => Promise<void>
  renameCurrentProject: () => Promise<void>
  editCurrentProjectName: () => void
  cancelProjectNameEditing: () => void
  exportCurrentProject: () => Promise<void>
  importProjectArchive: () => Promise<void>
  deleteCurrentProject: () => Promise<void>
  confirmDeleteProject: () => void
  selectJob: (job: GenerationJob | null) => void
  previewJob: (job: GenerationJob) => void
  toggleFavorite: (asset: GeneratedAsset) => Promise<void>
  deleteJob: () => Promise<void>
  saveAsset: (asset: GeneratedAsset) => Promise<void>
  copyAsset: (asset: GeneratedAsset) => Promise<void>
  openPreview: (asset: GeneratedAsset) => void
  selectPreviewAsset: (asset: GeneratedAsset) => void
}

export function useProjectWorkspace(
  form: GenerationRequest,
  pendingFlowGenerations: Ref<PendingFlowGeneration[]>
): ProjectWorkspaceController {
  const api = window.imageDeck
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
  const pendingDeleteJob = ref<GenerationJob | null>(null)
  const deletingJob = ref(false)

  const currentProject = computed(() =>
    projectState.value.projects.find(
      (project) => project.id === projectState.value.currentProjectId
    )
  )
  const currentAssets = computed(() => selectedJob.value?.assets ?? [])
  const projectTransferBusy = computed(() => exportingProject.value || importingProject.value)

  watch(projectsOpen, (open) => {
    if (!open) cancelProjectNameEditing()
  })

  function initialize(nextProjects: ProjectState, nextHistory: GenerationJob[]): void {
    projectState.value = nextProjects
    form.projectId = nextProjects.currentProjectId
    editingProjectName.value =
      nextProjects.projects.find((project) => project.id === nextProjects.currentProjectId)?.name ??
      ''
    history.value = nextHistory
    selectJob(nextHistory[0] ?? null)
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
    selectJob(null)
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

  async function createProject(): Promise<void> {
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

  function previewJob(job: GenerationJob): void {
    selectJob(job)
    const asset = job.assets[0]
    if (asset) openPreview(asset)
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

  async function deleteJob(): Promise<void> {
    const job = pendingDeleteJob.value
    if (!job) return
    deletingJob.value = true
    try {
      await api.deleteHistory(job.id)
      history.value = history.value.filter((value) => value.id !== job.id)
      if (selectedJob.value?.id === job.id) selectJob(history.value[0] ?? null)
      pendingDeleteJob.value = null
      toast.success('历史记录已删除。')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '删除失败。')
    } finally {
      deletingJob.value = false
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

  return {
    projectState,
    projectsOpen,
    projectName,
    editingProjectName,
    projectNameEditing,
    creatingProject,
    renamingProject,
    changingProject,
    pendingDeleteProject,
    deletingProject,
    exportingProject,
    importingProject,
    history,
    selectedJob,
    selectedAsset,
    previewOpen,
    pendingDeleteJob,
    deletingJob,
    currentProject,
    currentAssets,
    projectTransferBusy,
    initialize,
    switchProject,
    createProject,
    renameCurrentProject,
    editCurrentProjectName,
    cancelProjectNameEditing,
    exportCurrentProject,
    importProjectArchive,
    deleteCurrentProject,
    confirmDeleteProject,
    selectJob,
    previewJob,
    toggleFavorite,
    deleteJob,
    saveAsset,
    copyAsset,
    openPreview,
    selectPreviewAsset
  }
}
