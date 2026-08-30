<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core'
import { LoaderCircleIcon, XIcon } from '@lucide/vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

export interface GenerationFlowLoadingNodeData {
  prompt: string
  hasParent: boolean
  branchLabel?: string
  cancelling: boolean
  onCancel: () => void
}

defineProps<{
  data: GenerationFlowLoadingNodeData
}>()
</script>

<template>
  <Handle v-if="data.hasParent" type="target" :position="Position.Left" />
  <article
    class="w-72 overflow-hidden rounded-xl border border-primary/50 bg-card shadow-xl shadow-background/30 ring-2 ring-primary/15"
  >
    <div class="flex items-start gap-3 p-3">
      <div class="flex size-20 shrink-0 items-center justify-center rounded-lg bg-muted">
        <LoaderCircleIcon class="size-6 animate-spin text-primary" />
      </div>
      <div class="min-w-0 flex-1">
        <div class="mb-1.5 flex items-center gap-1.5">
          <Badge variant="secondary">
            {{ data.branchLabel ? `${data.branchLabel} · ` : ''
            }}{{ data.cancelling ? '正在中断' : '正在生成' }}
          </Badge>
        </div>
        <p class="line-clamp-3 text-xs font-medium leading-5">{{ data.prompt }}</p>
      </div>
    </div>
    <div class="nodrag flex items-center justify-between gap-2 border-t bg-muted/25 px-3 py-2">
      <Button variant="outline" size="xs" :disabled="data.cancelling" @click.stop="data.onCancel">
        <XIcon data-icon="inline-start" />停止
      </Button>
    </div>
  </article>
</template>

<style scoped>
:deep(.vue-flow__handle) {
  width: 10px;
  height: 10px;
  border: 2px solid var(--background);
  background: var(--primary);
}
</style>
