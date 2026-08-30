<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core'
import { CircleAlertIcon, Trash2Icon } from '@lucide/vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog'

export interface GenerationFlowErrorNodeData {
  prompt: string
  hasParent: boolean
  branchLabel?: string
  error?: string
  onRemove: () => void
}

defineProps<{
  data: GenerationFlowErrorNodeData
}>()
</script>

<template>
  <Handle v-if="data.hasParent" type="target" :position="Position.Left" />
  <article
    class="w-72 overflow-hidden rounded-xl border border-destructive/60 bg-card shadow-xl shadow-background/30 ring-2 ring-destructive/15"
  >
    <div class="flex items-start gap-3 p-3">
      <div class="flex size-20 shrink-0 items-center justify-center rounded-lg bg-destructive/10">
        <CircleAlertIcon class="size-6 text-destructive" />
      </div>
      <div class="min-w-0 flex-1">
        <div class="mb-1.5 flex items-center gap-1.5">
          <Badge variant="destructive">
            {{ data.branchLabel ? `${data.branchLabel} · ` : '' }}生成失败
          </Badge>
        </div>
        <p class="line-clamp-3 text-xs font-medium leading-5">{{ data.prompt }}</p>
      </div>
    </div>
    <div class="nodrag flex items-center justify-between gap-2 border-t bg-destructive/5 px-3 py-2">
      <Dialog>
        <DialogTrigger as-child>
          <Button variant="outline" size="xs">查看详情</Button>
        </DialogTrigger>
        <DialogContent class="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>生成失败详情</DialogTitle>
          </DialogHeader>
          <div class="flex flex-col gap-3">
            <div>
              <p class="mb-1 text-xs font-medium text-muted-foreground">错误信息</p>
              <pre
                class="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg border bg-muted/40 p-3 text-xs leading-5"
                >{{ data.error || '未知错误。' }}</pre>
            </div>
            <div>
              <p class="mb-1 text-xs font-medium text-muted-foreground">提示词</p>
              <p
                class="max-h-40 overflow-auto whitespace-pre-wrap rounded-lg border p-3 text-xs leading-5"
              >
                {{ data.prompt }}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="destructive" @click="data.onRemove">
              <Trash2Icon data-icon="inline-start" />移除错误节点
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Button
        variant="ghost"
        size="icon-xs"
        class="text-destructive"
        aria-label="移除错误节点"
        @click.stop="data.onRemove"
      >
        <Trash2Icon />
      </Button>
    </div>
  </article>
</template>

<style scoped>
:deep(.vue-flow__handle) {
  width: 10px;
  height: 10px;
  border: 2px solid var(--background);
  background: var(--destructive);
}
</style>
