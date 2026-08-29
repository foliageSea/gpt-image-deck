<script setup lang="ts">
import type { PromptTemplate, PromptTemplateInput } from '../../../shared/image-types'
import {
  BookOpenIcon,
  CheckIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
  XIcon
} from '@lucide/vue'
import { computed, reactive, ref, watch } from 'vue'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'

const props = defineProps<{
  open: boolean
  prompts: PromptTemplate[]
}>()

const emit = defineEmits<{
  'update:open': [open: boolean]
  select: [prompt: PromptTemplate]
  create: [input: PromptTemplateInput]
  update: [id: string, input: PromptTemplateInput]
  delete: [id: string]
}>()

const search = ref('')
const editingId = ref<string | null>(null)
const pendingDeleteId = ref<string | null>(null)
const draft = reactive<PromptTemplateInput>({ title: '', content: '' })
const filteredPrompts = computed(() => {
  const query = search.value.trim().toLocaleLowerCase()
  return query
    ? props.prompts.filter(
        (prompt) =>
          prompt.title.toLocaleLowerCase().includes(query) ||
          prompt.content.toLocaleLowerCase().includes(query)
      )
    : props.prompts
})
const canSave = computed(
  () =>
    draft.title.trim().length > 0 &&
    draft.title.trim().length <= 80 &&
    draft.content.trim().length > 0 &&
    draft.content.trim().length <= 32000
)

watch(
  () => props.open,
  (open) => {
    if (!open) resetDraft()
  }
)

function resetDraft(): void {
  editingId.value = null
  pendingDeleteId.value = null
  draft.title = ''
  draft.content = ''
}

function editPrompt(prompt: PromptTemplate): void {
  editingId.value = prompt.id
  pendingDeleteId.value = null
  draft.title = prompt.title
  draft.content = prompt.content
}

function savePrompt(): void {
  if (!canSave.value) return
  const input = { title: draft.title.trim(), content: draft.content.trim() }
  if (editingId.value) emit('update', editingId.value, input)
  else emit('create', input)
  resetDraft()
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="flex max-h-[calc(100dvh-2rem)] flex-col sm:max-w-3xl">
      <DialogHeader>
        <DialogTitle>提示词库</DialogTitle>
      </DialogHeader>

      <div class="grid min-h-0 flex-1 gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div class="flex min-h-0 flex-col gap-3">
          <div class="relative">
            <SearchIcon
              class="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input v-model="search" class="pl-9" placeholder="搜索名称或内容" />
          </div>
          <ScrollArea class="min-h-52 flex-1 md:h-[420px]">
            <div v-if="filteredPrompts.length" class="flex flex-col gap-2 pr-3">
              <div
                v-for="prompt in filteredPrompts"
                :key="prompt.id"
                class="flex flex-col gap-2 rounded-xl border p-3"
              >
                <button type="button" class="text-left" @click="emit('select', prompt)">
                  <p class="text-sm font-medium">{{ prompt.title }}</p>
                  <p class="mt-1 line-clamp-3 text-xs leading-5 text-muted-foreground">
                    {{ prompt.content }}
                  </p>
                </button>
                <div class="flex items-center justify-between">
                  <Button variant="secondary" size="xs" @click="emit('select', prompt)">
                    <CheckIcon data-icon="inline-start" />自动填入
                  </Button>
                  <div class="flex gap-1">
                    <template v-if="pendingDeleteId === prompt.id">
                      <Button variant="ghost" size="xs" @click="pendingDeleteId = null">
                        <XIcon data-icon="inline-start" />取消
                      </Button>
                      <Button variant="destructive" size="xs" @click="emit('delete', prompt.id)">
                        确认删除
                      </Button>
                    </template>
                    <template v-else>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label="编辑提示词"
                        @click="editPrompt(prompt)"
                      >
                        <PencilIcon />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label="删除提示词"
                        @click="pendingDeleteId = prompt.id"
                      >
                        <Trash2Icon />
                      </Button>
                    </template>
                  </div>
                </div>
              </div>
            </div>
            <Empty v-else class="min-h-52 border-none">
              <EmptyHeader>
                <EmptyMedia variant="icon"><BookOpenIcon /></EmptyMedia>
                <EmptyTitle>{{ search ? '没有匹配的提示词' : '还没有保存提示词' }}</EmptyTitle>
              </EmptyHeader>
            </Empty>
          </ScrollArea>
        </div>

        <FieldGroup>
          <div class="flex items-center justify-between">
            <p class="text-sm font-medium">{{ editingId ? '编辑提示词' : '新增提示词' }}</p>
            <Button v-if="editingId" variant="ghost" size="xs" @click="resetDraft">取消编辑</Button>
          </div>
          <Field>
            <FieldLabel for="prompt-title">名称</FieldLabel>
            <Input
              id="prompt-title"
              v-model="draft.title"
              maxlength="80"
              placeholder="例如：电影感产品摄影"
            />
            <FieldDescription class="text-right">{{ draft.title.length }}/80</FieldDescription>
          </Field>
          <Field>
            <FieldLabel for="prompt-content">提示词</FieldLabel>
            <Textarea
              id="prompt-content"
              v-model="draft.content"
              class="min-h-52 resize-none"
              maxlength="32000"
              placeholder="输入需要反复使用的完整提示词……"
            />
            <FieldDescription class="text-right">{{ draft.content.length }}/32000</FieldDescription>
          </Field>
          <Button :disabled="!canSave" @click="savePrompt">
            <PencilIcon v-if="editingId" data-icon="inline-start" />
            <PlusIcon v-else data-icon="inline-start" />
            {{ editingId ? '保存修改' : '添加到提示词库' }}
          </Button>
        </FieldGroup>
      </div>

      <DialogFooter class="sm:justify-between">
        <span class="text-xs text-muted-foreground">已保存 {{ prompts.length }}/500 条</span>
        <Button variant="outline" @click="emit('update:open', false)">关闭</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
