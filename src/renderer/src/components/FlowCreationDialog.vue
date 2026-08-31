<script setup lang="ts">
import type { GeneratedAsset, GenerationJob } from '../../../shared/image-types'
import type { FlowCreation } from '@/types/app'
import { BookOpenIcon, CircleCheckIcon, PlusIcon, SparklesIcon, XIcon } from '@lucide/vue'
import { computed } from 'vue'
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

const props = defineProps<{ history: GenerationJob[] }>()
const creation = defineModel<FlowCreation | null>('creation', { required: true })

const emit = defineEmits<{
  openPromptLibrary: []
  generate: []
}>()

const availableLeadingAssets = computed(() => {
  const job = creation.value?.job
  return job ? priorSourceAssets(job) : []
})

function priorSourceAssets(job: GenerationJob): GeneratedAsset[] {
  const jobsById = new Map(props.history.map((item) => [item.id, item]))
  const assetsById = new Map(
    props.history.flatMap((item) => item.assets.map((asset) => [asset.id, asset] as const))
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

async function pickReferences(position: 'before' | 'after' = 'after'): Promise<void> {
  const draft = creation.value
  if (!draft) return
  try {
    const picked = await window.imageDeck.pickReferenceImages()
    const existingIds = new Set(
      [...draft.leadingReferences, ...draft.references].map((item) => item.id)
    )
    const unique = picked.filter((item) => !existingIds.has(item.id))
    const available =
      (draft.job ? 15 : 16) -
      draft.leadingAssets.length -
      draft.leadingReferences.length -
      draft.references.length
    if (position === 'before') draft.leadingReferences.push(...unique.slice(0, available))
    else draft.references.push(...unique.slice(0, available))
  } catch (error) {
    toast.error(error instanceof Error ? error.message : '参考图片读取失败。')
  }
}

function removeReference(id: string, position: 'before' | 'after' = 'after'): void {
  if (!creation.value) return
  const key = position === 'before' ? 'leadingReferences' : 'references'
  creation.value[key] = creation.value[key].filter((item) => item.id !== id)
}

function toggleLeadingAsset(asset: GeneratedAsset): void {
  const draft = creation.value
  if (!draft) return
  if (draft.leadingAssets.some((item) => item.id === asset.id)) {
    draft.leadingAssets = draft.leadingAssets.filter((item) => item.id !== asset.id)
    return
  }
  if (draft.leadingAssets.length + draft.leadingReferences.length + draft.references.length >= 15) {
    toast.info('参考图片最多 16 张（含当前节点）。')
    return
  }
  draft.leadingAssets.push(asset)
}

function isLeadingAssetSelected(asset: GeneratedAsset): boolean {
  return creation.value?.leadingAssets.some((item) => item.id === asset.id) ?? false
}

function referenceOrder(
  kind: 'leading-asset' | 'leading-reference' | 'source' | 'reference',
  id?: string
): number | undefined {
  const draft = creation.value
  if (!draft) return undefined
  if (kind === 'leading-asset') {
    const index = draft.leadingAssets.findIndex((item) => item.id === id)
    return index < 0 ? undefined : index + 1
  }
  if (kind === 'leading-reference') {
    const index = draft.leadingReferences.findIndex((item) => item.id === id)
    return index < 0 ? undefined : draft.leadingAssets.length + index + 1
  }
  const sourceOrder = draft.leadingAssets.length + draft.leadingReferences.length + 1
  if (kind === 'source') return draft.job ? sourceOrder : undefined
  const index = draft.references.findIndex((item) => item.id === id)
  if (index < 0) return undefined
  return (
    draft.leadingAssets.length + draft.leadingReferences.length + (draft.job ? 1 : 0) + index + 1
  )
}
</script>

<template>
  <Dialog :open="Boolean(creation)" @update:open="!$event && (creation = null)">
    <DialogContent class="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
      <DialogHeader>
        <DialogTitle>
          {{
            !creation?.job ? '新建起始节点' : creation.variant ? '生成节点变体' : '基于节点继续创作'
          }}
        </DialogTitle>
      </DialogHeader>
      <div v-if="creation" class="flex flex-col gap-5">
        <div v-if="creation.job" class="flex items-center gap-3 rounded-xl border bg-muted/20 p-3">
          <img
            v-if="creation.job.assets[0]"
            :src="creation.job.assets[0].url"
            alt="来源节点图片"
            class="size-16 rounded-lg object-cover"
          />
          <div class="min-w-0">
            <Badge variant="secondary">来源节点</Badge>
            <p class="mt-1 line-clamp-2 text-xs text-muted-foreground">
              {{ creation.job.prompt }}
            </p>
          </div>
        </div>
        <FieldGroup>
          <Field>
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
              :placeholder="
                creation.job ? '描述希望基于当前节点继续生成的画面……' : '描述希望创建的画面……'
              "
            />
            <FieldDescription class="flex justify-end">
              <span>{{ creation.prompt.length }}/32000</span>
            </FieldDescription>
          </Field>
          <Field v-if="creation.job">
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
                  v-if="referenceOrder('leading-asset', asset.id)"
                  class="absolute left-1 top-1"
                >
                  {{ referenceOrder('leading-asset', asset.id) }}
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
                v-for="image in creation.leadingReferences"
                :key="image.id"
                class="group relative aspect-square overflow-hidden rounded-lg border bg-muted"
              >
                <img :src="image.url" :alt="image.name" class="size-full object-cover" />
                <Badge class="absolute left-1 top-1">
                  {{ referenceOrder('leading-reference', image.id) }}
                </Badge>
                <Button
                  variant="destructive"
                  size="icon-xs"
                  class="absolute right-1 top-1 opacity-0 group-hover:opacity-100"
                  aria-label="移除当前节点前的参考图"
                  @click="removeReference(image.id, 'before')"
                >
                  <XIcon />
                </Button>
              </div>
              <button
                v-if="
                  creation.leadingAssets.length +
                    creation.leadingReferences.length +
                    creation.references.length <
                  15
                "
                type="button"
                class="flex aspect-square items-center justify-center rounded-lg border border-dashed text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/5 hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
                aria-label="上传当前节点前的参考图片"
                @click="pickReferences('before')"
              >
                <PlusIcon class="size-4" />
              </button>
            </div>
          </Field>
          <Field>
            <div class="flex items-center justify-between">
              <FieldLabel>{{ creation.job ? '当前节点后的参考图' : '参考图片' }}</FieldLabel>
              <span class="text-xs text-muted-foreground">
                {{
                  creation.references.length +
                  creation.leadingAssets.length +
                  creation.leadingReferences.length +
                  (creation.job ? 1 : 0)
                }}/16
              </span>
            </div>
            <div class="grid grid-cols-6 gap-2">
              <div
                v-if="creation.job"
                class="relative aspect-square overflow-hidden rounded-lg border bg-muted"
              >
                <img
                  v-if="creation.job.assets[0]"
                  :src="creation.job.assets[0].url"
                  alt="来源节点参考图"
                  class="size-full object-cover"
                />
                <Badge class="absolute left-1 top-1">{{ referenceOrder('source') }}</Badge>
                <Badge class="absolute bottom-1 left-1" variant="secondary">节点</Badge>
              </div>
              <div
                v-for="image in creation.references"
                :key="image.id"
                class="group relative aspect-square overflow-hidden rounded-lg border bg-muted"
              >
                <img :src="image.url" :alt="image.name" class="size-full object-cover" />
                <Badge class="absolute left-1 top-1">
                  {{ referenceOrder('reference', image.id) }}
                </Badge>
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
                v-if="
                  creation.references.length +
                    creation.leadingAssets.length +
                    creation.leadingReferences.length <
                  (creation.job ? 15 : 16)
                "
                type="button"
                class="flex aspect-square items-center justify-center rounded-lg border border-dashed text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/5 hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
                aria-label="继续上传参考图片"
                @click="pickReferences('after')"
              >
                <PlusIcon class="size-4" />
              </button>
            </div>
          </Field>
          <div class="grid grid-cols-3 gap-3">
            <Field>
              <FieldLabel>画幅</FieldLabel>
              <Select v-model="creation.size">
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
              <FieldLabel>分支数量</FieldLabel>
              <Select v-model="creation.n">
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
        <Button variant="outline" @click="creation = null">取消</Button>
        <Button :disabled="!creation?.prompt.trim()" @click="emit('generate')">
          <SparklesIcon data-icon="inline-start" />
          生成并加入画布
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
