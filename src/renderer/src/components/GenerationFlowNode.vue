<script setup lang="ts">
import type { GenerationJob } from '../../../shared/image-types'
import { Handle, Position } from '@vue-flow/core'
import {
  Clock3Icon,
  GitBranchIcon,
  HeartIcon,
  ImageIcon,
  SparklesIcon,
  Trash2Icon
} from '@lucide/vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

export interface GenerationFlowNodeData {
  job: GenerationJob
  onSelect: (job: GenerationJob) => void
  onContinue: (job: GenerationJob, variant: boolean) => void
  onDelete: (job: GenerationJob) => void
}

defineProps<{
  data: GenerationFlowNodeData
  selected?: boolean
}>()

function nodeType(job: GenerationJob): string {
  if (!job.parentJobId) return '初始生成'
  return job.request.inputFidelity === 'low' ? '生成变体' : '继续创作'
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value))
}
</script>

<template>
  <Handle v-if="data.job.parentJobId" type="target" :position="Position.Left" />
  <article
    :class="[
      'w-72 overflow-hidden rounded-xl border bg-card shadow-xl shadow-background/30 transition-colors',
      selected ? 'border-primary ring-2 ring-primary/30' : 'hover:border-primary/50'
    ]"
    @dblclick="data.onSelect(data.job)"
  >
    <div class="flex items-start gap-3 p-3">
      <div class="relative size-20 shrink-0 overflow-hidden rounded-lg bg-muted">
        <img
          v-if="data.job.assets[0]"
          :src="data.job.assets[0].url"
          alt="流程节点缩略图"
          class="size-full object-cover"
          draggable="false"
        />
        <div v-else class="flex size-full items-center justify-center">
          <ImageIcon class="size-5 text-muted-foreground" />
        </div>
        <Badge
          v-if="data.job.assets.some((asset) => asset.favorite)"
          variant="secondary"
          class="absolute bottom-1 left-1 gap-1 bg-background/90 px-1.5 shadow-sm backdrop-blur"
          :aria-label="`${data.job.assets.filter((asset) => asset.favorite).length} 张已收藏`"
        >
          <HeartIcon class="fill-current" />
          {{ data.job.assets.filter((asset) => asset.favorite).length }}
        </Badge>
      </div>
      <div class="min-w-0 flex-1">
        <div class="mb-1.5 flex items-center gap-1.5">
          <Badge :variant="data.job.parentJobId ? 'secondary' : 'outline'">
            {{ nodeType(data.job) }}
          </Badge>
          <span class="text-[10px] text-muted-foreground">
            {{ data.job.assets.length }} 张 · {{ data.job.request.referenceCount }} 个参考
          </span>
        </div>
        <p class="line-clamp-3 text-xs font-medium leading-5">{{ data.job.prompt }}</p>
      </div>
    </div>
    <div class="flex items-center justify-between gap-2 border-t bg-muted/25 px-3 py-2">
      <span class="flex items-center gap-1 text-[10px] text-muted-foreground">
        <Clock3Icon class="size-3" />{{ formatDate(data.job.createdAt) }}
      </span>
      <div class="nodrag flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon-xs"
          class="text-destructive"
          aria-label="删除此流程节点"
          @click.stop="data.onDelete(data.job)"
        >
          <Trash2Icon />
        </Button>
        <Button
          v-if="data.job.assets[0]"
          variant="ghost"
          size="xs"
          aria-label="基于此节点生成变体"
          @click.stop="data.onContinue(data.job, true)"
        >
          <SparklesIcon data-icon="inline-start" />变体
        </Button>
        <Button
          v-if="data.job.assets[0]"
          variant="secondary"
          size="xs"
          aria-label="基于此节点继续创作"
          @click.stop="data.onContinue(data.job, false)"
        >
          <GitBranchIcon data-icon="inline-start" />继续
        </Button>
      </div>
    </div>
  </article>
  <Handle type="source" :position="Position.Right" />
</template>

<style scoped>
:deep(.vue-flow__handle) {
  width: 10px;
  height: 10px;
  border: 2px solid var(--background);
  background: var(--primary);
}
</style>
