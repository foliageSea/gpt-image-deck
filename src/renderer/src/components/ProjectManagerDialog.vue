<script setup lang="ts">
import type { Project, ProjectState } from '../../../shared/image-types'
import { DownloadIcon, LoaderCircleIcon, Trash2Icon, UploadCloudIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
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

defineProps<{
  projectState: ProjectState
  currentProject?: Project
  historyCount: number
  projectBusy: boolean
  changingProject: boolean
  creatingProject: boolean
  renamingProject: boolean
  importingProject: boolean
  exportingProject: boolean
}>()

const open = defineModel<boolean>('open', { required: true })
const projectName = defineModel<string>('projectName', { required: true })
const editingProjectName = defineModel<string>('editingProjectName', { required: true })
const projectNameEditing = defineModel<boolean>('projectNameEditing', { required: true })

defineEmits<{
  switchProject: [projectId: unknown]
  create: []
  editName: []
  cancelEditName: []
  rename: []
  delete: []
  import: []
  export: []
}>()
</script>

<template>
  <Dialog v-model:open="open">
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
              @keydown.enter="$emit('create')"
            />
            <Button
              :disabled="!projectName.trim() || creatingProject || projectBusy"
              @click="$emit('create')"
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
            @update:model-value="$emit('switchProject', $event)"
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
                  @keydown.enter="$emit('rename')"
                  @keydown.esc="$emit('cancelEditName')"
                />
                <button
                  v-else
                  type="button"
                  class="block max-w-full truncate rounded px-1 text-left text-sm font-medium hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  aria-label="编辑项目名称"
                  @click="$emit('editName')"
                >
                  {{ currentProject?.name }}
                </button>
              </div>
              <Button
                v-if="projectNameEditing"
                size="sm"
                :disabled="!editingProjectName.trim() || renamingProject || projectBusy"
                @click="$emit('rename')"
              >
                <LoaderCircleIcon v-if="renamingProject" class="animate-spin" />
                保存
              </Button>
              <Button
                variant="destructive"
                size="sm"
                :disabled="projectState.projects.length === 1 || projectBusy || changingProject"
                @click="$emit('delete')"
              >
                <Trash2Icon data-icon="inline-start" />删除项目
              </Button>
            </div>
            <p class="mt-1 text-xs text-muted-foreground">{{ historyCount }} 条历史记录</p>
          </div>
        </Field>
        <Field>
          <FieldLabel>迁移项目</FieldLabel>
          <div class="grid grid-cols-2 gap-2">
            <Button variant="outline" :disabled="projectBusy" @click="$emit('import')">
              <LoaderCircleIcon
                v-if="importingProject"
                data-icon="inline-start"
                class="animate-spin"
              />
              <UploadCloudIcon v-else data-icon="inline-start" />导入项目
            </Button>
            <Button variant="outline" :disabled="projectBusy" @click="$emit('export')">
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
</template>
