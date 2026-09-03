<script setup lang="ts">
import type { GeneratedAsset } from '../../../shared/image-types'
import type { FavoriteAssetEntry } from '@/types/app'
import { DownloadIcon, HeartIcon, LoaderCircleIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'

defineProps<{
  entries: FavoriteAssetEntry[]
  exporting?: boolean
}>()

const open = defineModel<boolean>('open', { required: true })

defineEmits<{
  preview: [asset: GeneratedAsset]
  favorite: [asset: GeneratedAsset]
  export: []
}>()
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent
      class="max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden sm:max-w-4xl"
    >
      <DialogHeader>
        <DialogTitle>收藏图片</DialogTitle>
        <DialogDescription>当前项目共收藏 {{ entries.length }} 张图片</DialogDescription>
      </DialogHeader>

      <div v-if="entries.length" class="-mr-2 min-h-0 overflow-y-auto pr-2">
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          <article
            v-for="entry in entries"
            :key="entry.asset.id"
            class="group relative overflow-hidden rounded-xl border bg-card"
          >
            <button
              type="button"
              class="block aspect-square w-full overflow-hidden bg-muted text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              :aria-label="`预览 ${entry.asset.name}`"
              @click="$emit('preview', entry.asset)"
            >
              <img
                :src="entry.asset.url"
                :alt="entry.asset.name"
                class="size-full object-cover transition-transform group-hover:scale-[1.03]"
                draggable="false"
              />
            </button>
            <Button
              variant="secondary"
              size="icon-sm"
              class="absolute right-2 top-2 shadow-sm"
              aria-label="取消收藏"
              @click="$emit('favorite', entry.asset)"
            >
              <HeartIcon class="fill-current" />
            </Button>
            <div class="min-w-0 p-2.5">
              <p class="truncate text-xs font-medium">{{ entry.asset.name }}</p>
              <p class="mt-0.5 truncate text-[10px] text-muted-foreground">
                {{ entry.job.prompt }}
              </p>
            </div>
          </article>
        </div>
      </div>

      <Empty v-else class="min-h-64 border">
        <EmptyHeader>
          <EmptyMedia variant="icon"><HeartIcon /></EmptyMedia>
          <EmptyTitle>还没有收藏图片</EmptyTitle>
          <EmptyDescription>在节点图片预览中点击“收藏”，图片会集中显示在这里。</EmptyDescription>
        </EmptyHeader>
      </Empty>

      <DialogFooter>
        <Button variant="outline" @click="open = false">关闭</Button>
        <Button :disabled="!entries.length || exporting" @click="$emit('export')">
          <LoaderCircleIcon v-if="exporting" data-icon="inline-start" class="animate-spin" />
          <DownloadIcon v-else data-icon="inline-start" />
          一键导出收藏
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
