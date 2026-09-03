<script setup lang="ts">
import type { GeneratedAsset, GenerationRequest, PromptTemplate } from '../../shared/image-types'
import type { PendingFlowGeneration } from '@/types/app'
import { LoaderCircleIcon } from '@lucide/vue'
import { computed, onMounted, reactive, ref } from 'vue'
import { toast } from 'vue-sonner'
import FlowCreationDialog from '@/components/FlowCreationDialog.vue'
import GenerationFlow from '@/components/GenerationFlow.vue'
import ImagePreview from '@/components/ImagePreview.vue'
import ProjectManagerDialog from '@/components/ProjectManagerDialog.vue'
import PromptLibraryDialog from '@/components/PromptLibraryDialog.vue'
import SettingsDialog from '@/components/SettingsDialog.vue'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Toaster } from '@/components/ui/sonner'
import { useAppSettings } from '@/composables/useAppSettings'
import { useGenerationFlow } from '@/composables/useGenerationFlow'
import { useProjectWorkspace } from '@/composables/useProjectWorkspace'
import { usePromptLibrary } from '@/composables/usePromptLibrary'

const api = window.imageDeck
const form = reactive<GenerationRequest>({
  projectId: '',
  prompt: '',
  referenceIds: [],
  referenceAssetIds: [],
  n: 1,
  size: '1024x1024',
  quality: 'auto',
  format: 'png',
  compression: 90,
  background: 'auto',
  inputFidelity: 'low'
})
const pendingFlowGenerations = ref<PendingFlowGeneration[]>([])

const {
  settings,
  form: settingsForm,
  open: settingsOpen,
  testing,
  connectionFeedback,
  backgroundImageUrl,
  initialize: initializeSettings,
  save: saveSettings,
  test: testSettings,
  clearCredential,
  pickBackground: pickWindowBackground,
  clearBackground: clearWindowBackground
} = useAppSettings()

const {
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
  initialize: initializeWorkspace,
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
  selectPreviewAsset
} = useProjectWorkspace(form, pendingFlowGenerations)

const {
  flowCreation,
  currentPendingGenerations,
  generating,
  openCreation,
  openRootCreation,
  generate,
  cancelGeneration,
  removeGeneration
} = useGenerationFlow({
  form,
  settings,
  projectState,
  history,
  pendingGenerations: pendingFlowGenerations,
  selectJob,
  openSettings: () => {
    settingsOpen.value = true
  }
})

const {
  prompts,
  open: promptsOpen,
  initialize: initializePrompts,
  create: createPrompt,
  update: updatePrompt,
  remove: deletePrompt
} = usePromptLibrary()

const projectBusy = computed(() => generating.value || projectTransferBusy.value)

async function load(): Promise<void> {
  try {
    const [nextSettings, nextProjects, nextPrompts] = await Promise.all([
      api.getSettings(),
      api.getProjects(),
      api.listPrompts()
    ])
    const nextHistory = await api.listHistory(nextProjects.currentProjectId)
    initializeSettings(nextSettings)
    initializePrompts(nextPrompts)
    initializeWorkspace(nextProjects, nextHistory)
  } catch (error) {
    toast.error(error instanceof Error ? error.message : '应用数据加载失败。')
  }
}

function continueWithAsset(
  asset: GeneratedAsset,
  variant = false,
  sourceJob = selectedJob.value
): void {
  if (!sourceJob) return
  selectJob(sourceJob)
  previewOpen.value = false
  openCreation(sourceJob, variant, asset)
}

function fillPrompt(prompt: PromptTemplate): void {
  if (flowCreation.value) flowCreation.value.prompt = prompt.content
  promptsOpen.value = false
  toast.success(`已填入“${prompt.title}”。`)
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
    :pending-generations="currentPendingGenerations"
    @select="selectJob"
    @preview="previewJob"
    @create="openCreation"
    @create-root="openRootCreation"
    @switch-project="switchProject"
    @manage-projects="projectsOpen = true"
    @delete="pendingDeleteJob = $event"
    @cancel-generation="cancelGeneration"
    @remove-generation="removeGeneration"
    @open-settings="settingsOpen = true"
  />

  <Dialog :open="Boolean(pendingDeleteJob)" @update:open="!$event && (pendingDeleteJob = null)">
    <DialogContent :show-close-button="false">
      <DialogHeader>
        <DialogTitle>永久删除这条历史？</DialogTitle>
      </DialogHeader>
      <DialogFooter>
        <Button variant="outline" :disabled="deletingJob" @click="pendingDeleteJob = null">
          取消
        </Button>
        <Button variant="destructive" :disabled="deletingJob" @click="deleteJob">
          <LoaderCircleIcon v-if="deletingJob" data-icon="inline-start" class="animate-spin" />
          永久删除
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>

  <ProjectManagerDialog
    v-model:open="projectsOpen"
    v-model:project-name="projectName"
    v-model:editing-project-name="editingProjectName"
    v-model:project-name-editing="projectNameEditing"
    :project-state="projectState"
    :current-project="currentProject"
    :history-count="history.length"
    :project-busy="projectBusy"
    :changing-project="changingProject"
    :creating-project="creatingProject"
    :renaming-project="renamingProject"
    :importing-project="importingProject"
    :exporting-project="exportingProject"
    @switch-project="switchProject"
    @create="createProject"
    @edit-name="editCurrentProjectName"
    @cancel-edit-name="cancelProjectNameEditing"
    @rename="renameCurrentProject"
    @delete="confirmDeleteProject"
    @import="importProjectArchive"
    @export="exportCurrentProject"
  />

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

  <FlowCreationDialog
    v-model:creation="flowCreation"
    :history="history"
    @open-prompt-library="promptsOpen = true"
    @generate="generate"
  />

  <PromptLibraryDialog
    v-model:open="promptsOpen"
    :prompts="prompts"
    @select="fillPrompt"
    @create="createPrompt"
    @update="updatePrompt"
    @delete="deletePrompt"
  />

  <SettingsDialog
    v-model:open="settingsOpen"
    v-model:form="settingsForm"
    :settings="settings"
    :testing="testing"
    :connection-feedback="connectionFeedback"
    @pick-background="pickWindowBackground"
    @clear-background="clearWindowBackground"
    @clear-credential="clearCredential"
    @test="testSettings"
    @save="saveSettings"
  />

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
