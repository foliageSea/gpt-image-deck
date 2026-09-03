<script setup lang="ts">
import type { GeneratedAsset, GenerationJob } from '../../../shared/image-types'
import type { FlowCreation, FlowReference } from '@/types/app'
import {
  BookOpenIcon,
  GripVerticalIcon,
  ImagePlusIcon,
  PinIcon,
  SparklesIcon,
  XIcon
} from '@lucide/vue'
import { computed, ref } from 'vue'
import { toast } from 'vue-sonner'
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
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

const props = defineProps<{ history: GenerationJob[] }>()
const creation = defineModel<FlowCreation | null>('creation', { required: true })
const draggedReferenceIndex = ref<number | null>(null)
const dragOverReferenceIndex = ref<number | null>(null)

const emit = defineEmits<{
  openPromptLibrary: []
  generate: []
}>()

const projectAssets = computed(() =>
  props.history
    .flatMap((job) => job.assets)
    .sort((left, right) => Number(Boolean(right.favorite)) - Number(Boolean(left.favorite)))
)

const invalidOutput = computed(
  () => creation.value?.format === 'jpeg' && creation.value.background === 'transparent'
)

const canGenerate = computed(() => {
  const draft = creation.value
  return Boolean(
    draft &&
    draft.prompt.trim() &&
    draft.prompt.length <= 32000 &&
    draft.compression >= 0 &&
    draft.compression <= 100 &&
    !invalidOutput.value
  )
})

async function pickReferences(): Promise<void> {
  const draft = creation.value
  if (!draft) return
  try {
    const picked = await window.imageDeck.pickReferenceImages()
    const existingIds = new Set(draft.references.map((item) => item.id))
    const available = 16 - draft.references.length
    const references: FlowReference[] = picked
      .filter((item) => !existingIds.has(item.id))
      .slice(0, available)
      .map((item) => ({ ...item, kind: 'reference' }))
    draft.references.push(...references)
    if (picked.length > references.length) toast.info('参考图片最多 16 张。')
  } catch (error) {
    toast.error(error instanceof Error ? error.message : '参考图片读取失败。')
  }
}

function toggleProjectAsset(asset: GeneratedAsset): void {
  const draft = creation.value
  if (!draft) return
  const index = draft.references.findIndex((item) => item.assetId === asset.id)
  if (index >= 0) {
    removeReference(index)
    return
  }
  if (draft.references.length >= 16) {
    toast.info('参考图片最多 16 张。')
    return
  }
  draft.references.push({ ...asset, kind: 'asset', assetId: asset.id })
}

function isAssetSelected(asset: GeneratedAsset): boolean {
  return creation.value?.references.some((item) => item.assetId === asset.id) ?? false
}

function removeReference(index: number): void {
  const draft = creation.value
  if (!draft) return
  const [removed] = draft.references.splice(index, 1)
  if (removed?.primary && draft.job && draft.references[0]) draft.references[0].primary = true
}

function moveReference(index: number, offset: -1 | 1): void {
  const references = creation.value?.references
  const target = index + offset
  if (!references || target < 0 || target >= references.length) return
  const [item] = references.splice(index, 1)
  references.splice(target, 0, item)
}

function startReferenceDrag(event: DragEvent, index: number): void {
  draggedReferenceIndex.value = index
  dragOverReferenceIndex.value = null
  if (!event.dataTransfer) return
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('text/plain', String(index))
  const card = (event.currentTarget as HTMLElement).parentElement
  if (card) {
    const bounds = card.getBoundingClientRect()
    event.dataTransfer.setDragImage(card, event.clientX - bounds.left, event.clientY - bounds.top)
  }
}

function dragReferenceOver(index: number): void {
  dragOverReferenceIndex.value = draggedReferenceIndex.value === index ? null : index
}

function dropReference(index: number): void {
  const references = creation.value?.references
  const source = draggedReferenceIndex.value
  if (references && source !== null && source !== index) {
    const [item] = references.splice(source, 1)
    references.splice(index, 0, item)
  }
  finishReferenceDrag()
}

function finishReferenceDrag(): void {
  draggedReferenceIndex.value = null
  dragOverReferenceIndex.value = null
}

function setPrimary(index: number): void {
  const references = creation.value?.references
  if (!references) return
  references.forEach((item, itemIndex) => (item.primary = itemIndex === index))
}

function reuseStoredReferences(): void {
  const draft = creation.value
  const stored = draft?.job?.references ?? []
  if (!draft || !stored.length) return
  const existingIds = new Set(draft.references.map((item) => item.id))
  const additions = stored
    .filter((item) => !existingIds.has(item.id))
    .slice(0, 16 - draft.references.length)
    .map((item): FlowReference => ({ ...item, kind: 'reference' }))
  draft.references.push(...additions)
  if (additions.length < stored.length) toast.info('部分参考图已存在或超出 16 张上限。')
}
</script>

<template>
  <Dialog :open="Boolean(creation)" @update:open="!$event && (creation = null)">
    <DialogContent
      class="max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden sm:max-w-3xl"
    >
      <DialogHeader>
        <DialogTitle>
          {{
            !creation?.job ? '新建起始节点' : creation.variant ? '生成节点变体' : '基于节点继续创作'
          }}
        </DialogTitle>
      </DialogHeader>

      <div v-if="creation" class="-mr-2 flex min-h-0 flex-col gap-5 overflow-y-auto pr-2">
        <div v-if="creation.job" class="flex items-center gap-3 rounded-lg border bg-muted/20 p-3">
          <img
            v-if="creation.references.find((item) => item.primary)"
            :src="creation.references.find((item) => item.primary)?.url"
            alt="主参考图片"
            class="size-16 rounded-lg object-cover"
          />
          <div class="min-w-0 flex-1">
            <Badge variant="secondary">来源节点</Badge>
            <p class="mt-1 line-clamp-2 text-xs text-muted-foreground">{{ creation.job.prompt }}</p>
          </div>
          <Button
            v-if="creation.job.references?.length"
            variant="outline"
            size="sm"
            type="button"
            @click="reuseStoredReferences"
          >
            复用原参考图
          </Button>
        </div>

        <FieldGroup>
          <Field :data-invalid="creation.prompt.length > 32000">
            <div class="flex items-center justify-between">
              <FieldLabel for="flow-prompt">提示词</FieldLabel>
              <Button variant="ghost" size="xs" type="button" @click="emit('openPromptLibrary')">
                <BookOpenIcon data-icon="inline-start" />提示词库
              </Button>
            </div>
            <Textarea
              id="flow-prompt"
              v-model="creation.prompt"
              class="min-h-32 resize-none"
              maxlength="32000"
              :aria-invalid="creation.prompt.length > 32000"
              :placeholder="creation.job ? '描述希望如何修改主参考图片……' : '描述希望创建的画面……'"
            />
            <FieldDescription class="flex justify-end">
              <span>{{ creation.prompt.length }}/32000</span>
            </FieldDescription>
          </Field>

          <Field>
            <div class="flex items-center justify-between gap-3">
              <FieldLabel>参考图序列</FieldLabel>
              <span class="shrink-0 text-xs text-muted-foreground"
                >{{ creation.references.length }}/16</span
              >
            </div>
            <FieldDescription
              >拖动右上角手柄排序；序号即发送顺序，主参考用于标记当前分支来源。</FieldDescription
            >

            <div v-if="creation.references.length" class="grid grid-cols-3 gap-2 sm:grid-cols-6">
              <div
                v-for="(image, index) in creation.references"
                :key="`${image.kind}-${image.id}`"
                :class="
                  cn(
                    'group relative aspect-square overflow-hidden rounded-lg border bg-muted transition-[opacity,box-shadow,border-color]',
                    draggedReferenceIndex === index && 'opacity-40',
                    dragOverReferenceIndex === index && 'border-primary ring-2 ring-primary/30'
                  )
                "
                @dragenter.prevent="dragReferenceOver(index)"
                @dragover.prevent="dragReferenceOver(index)"
                @drop.prevent="dropReference(index)"
              >
                <img
                  :src="image.url"
                  :alt="image.name"
                  class="size-full object-cover"
                  draggable="false"
                />
                <Badge class="absolute left-1 top-1">{{ index + 1 }}</Badge>
                <Badge v-if="image.primary" class="absolute bottom-1 left-1" variant="secondary">
                  主参考
                </Badge>
                <span
                  class="absolute right-1 top-1 flex size-6 cursor-grab items-center justify-center rounded-md bg-secondary text-secondary-foreground shadow-sm active:cursor-grabbing"
                  draggable="true"
                  role="button"
                  tabindex="0"
                  :aria-label="`拖动调整第 ${index + 1} 张参考图顺序`"
                  @dragstart.stop="startReferenceDrag($event, index)"
                  @dragend="finishReferenceDrag"
                  @keydown.left.prevent="moveReference(index, -1)"
                  @keydown.right.prevent="moveReference(index, 1)"
                >
                  <GripVerticalIcon class="size-4" />
                </span>
                <div
                  class="absolute bottom-1 right-1 flex flex-col gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
                >
                  <TooltipProvider :delay-duration="250">
                    <Tooltip v-if="creation.job && !image.primary">
                      <TooltipTrigger as-child>
                        <Button
                          variant="secondary"
                          size="icon-xs"
                          aria-label="设为主参考"
                          @click="setPrimary(index)"
                        >
                          <PinIcon />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>设为主参考</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger as-child>
                        <Button
                          variant="destructive"
                          size="icon-xs"
                          aria-label="移除参考图"
                          @click="removeReference(index)"
                        >
                          <XIcon />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>移除</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </div>
            </div>

            <Button
              variant="outline"
              type="button"
              :disabled="creation.references.length >= 16"
              @click="pickReferences"
            >
              <ImagePlusIcon data-icon="inline-start" />从本地添加
            </Button>
          </Field>

          <Field v-if="projectAssets.length">
            <FieldLabel>项目图片</FieldLabel>
            <FieldDescription>点击可将任意历史结果加入或移出参考序列。</FieldDescription>
            <ScrollArea class="w-full whitespace-nowrap rounded-lg border">
              <div class="flex w-max gap-2 p-2">
                <button
                  v-for="asset in projectAssets"
                  :key="asset.id"
                  type="button"
                  :class="[
                    'relative size-16 shrink-0 overflow-hidden rounded-lg border bg-muted transition-colors',
                    isAssetSelected(asset)
                      ? 'border-primary ring-2 ring-primary/30'
                      : 'hover:border-primary/50'
                  ]"
                  :aria-pressed="isAssetSelected(asset)"
                  @click="toggleProjectAsset(asset)"
                >
                  <img :src="asset.url" :alt="asset.name" class="size-full object-cover" />
                  <Badge v-if="asset.favorite" class="absolute bottom-1 left-1" variant="secondary"
                    >收藏</Badge
                  >
                </button>
              </div>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </Field>

          <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field>
              <FieldLabel>画幅</FieldLabel>
              <Select v-model="creation.size">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="auto">自动</SelectItem>
                    <SelectItem value="1024x1024">1:1</SelectItem>
                    <SelectItem value="1536x1024">3:2</SelectItem>
                    <SelectItem value="1024x1536">2:3</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>质量</FieldLabel>
              <Select v-model="creation.quality">
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
              <FieldLabel>输出数量</FieldLabel>
              <Select v-model="creation.n">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem v-for="count in 4" :key="count" :value="count"
                      >{{ count }} 个节点</SelectItem
                    >
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>格式</FieldLabel>
              <Select v-model="creation.format">
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

          <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field :data-invalid="invalidOutput">
              <FieldLabel>背景</FieldLabel>
              <Select v-model="creation.background">
                <SelectTrigger :aria-invalid="invalidOutput"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="auto">自动</SelectItem>
                    <SelectItem value="opaque">不透明</SelectItem>
                    <SelectItem value="transparent">透明</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FieldDescription v-if="invalidOutput">JPEG 不支持透明背景。</FieldDescription>
            </Field>
            <Field>
              <FieldLabel for="flow-compression">压缩质量</FieldLabel>
              <Input
                id="flow-compression"
                :model-value="creation.compression"
                type="number"
                min="0"
                max="100"
                step="1"
                :disabled="creation.format === 'png'"
                @update:model-value="creation.compression = Number($event)"
              />
              <FieldDescription>{{
                creation.format === 'png' ? 'PNG 不使用此参数' : '0–100'
              }}</FieldDescription>
            </Field>
            <Field>
              <FieldLabel>输入一致性</FieldLabel>
              <Select v-model="creation.inputFidelity" :disabled="!creation.references.length">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="low">灵活</SelectItem>
                    <SelectItem value="high">严格</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FieldDescription>GPT Image 2 会自动高保真处理。</FieldDescription>
            </Field>
          </div>
        </FieldGroup>
      </div>

      <DialogFooter>
        <Button variant="outline" @click="creation = null">取消</Button>
        <Button :disabled="!canGenerate" @click="emit('generate')">
          <SparklesIcon data-icon="inline-start" />生成并加入画布
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
