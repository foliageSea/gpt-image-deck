<script setup lang="ts">
import type { GenerationJob } from '../../../shared/image-types'
import {
  Clock3Icon,
  GitBranchIcon,
  HeartIcon,
  HistoryIcon,
  ImageIcon,
  ListIcon,
  MoreHorizontalIcon,
  RotateCcwIcon,
  SearchIcon,
  Trash2Icon
} from '@lucide/vue'
import { computed, ref } from 'vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

const props = defineProps<{
  history: GenerationJob[]
  selectedJobId?: string
}>()

const search = ref('')
const favoritesOnly = ref(false)
const filteredHistory = computed(() => {
  const query = search.value.trim().toLocaleLowerCase()
  return props.history.filter((job) => {
    if (favoritesOnly.value && !job.assets.some((asset) => asset.favorite)) return false
    return !query || job.prompt.toLocaleLowerCase().includes(query)
  })
})

const emit = defineEmits<{
  select: [job: GenerationJob]
  reuse: [job: GenerationJob]
  delete: [job: GenerationJob]
  continue: [job: GenerationJob, variant: boolean]
  openFlow: []
}>()

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
  <div class="flex h-full min-h-0 flex-col">
    <div class="flex h-14 shrink-0 items-center justify-between gap-2 px-4">
      <div class="flex items-center gap-2 text-sm font-medium">
        <HistoryIcon class="size-4" />历史记录
      </div>
      <div class="flex items-center gap-2">
        <ToggleGroup type="single" model-value="list" variant="outline" size="sm">
          <ToggleGroupItem value="list" aria-label="列表模式">
            <ListIcon />
          </ToggleGroupItem>
          <ToggleGroupItem value="flow" aria-label="打开全屏流程" @click="emit('openFlow')">
            <GitBranchIcon />
          </ToggleGroupItem>
        </ToggleGroup>
        <Badge variant="outline">{{ history.length }}</Badge>
      </div>
    </div>
    <div class="flex shrink-0 gap-2 px-3 pb-3">
      <div class="relative min-w-0 flex-1">
        <SearchIcon
          class="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input v-model="search" class="pl-8" placeholder="搜索提示词" />
      </div>
      <Button
        :variant="favoritesOnly ? 'secondary' : 'outline'"
        size="icon"
        aria-label="只看收藏"
        @click="favoritesOnly = !favoritesOnly"
      >
        <HeartIcon :class="favoritesOnly && 'fill-current'" />
      </Button>
    </div>
    <Separator />
    <ScrollArea class="min-h-0 flex-1">
      <div v-if="filteredHistory.length" class="flex flex-col gap-2 p-3">
        <Card
          v-for="job in filteredHistory"
          :key="job.id"
          :class="[
            'cursor-pointer py-3 transition-colors hover:bg-accent/50',
            selectedJobId === job.id && 'border-primary/40 bg-primary/5'
          ]"
          @click="emit('select', job)"
        >
          <CardContent class="px-3">
            <div class="flex gap-3">
              <div class="size-14 shrink-0 overflow-hidden rounded-lg bg-muted">
                <img
                  v-if="job.assets[0]"
                  :src="job.assets[0].url"
                  alt="历史缩略图"
                  class="size-full object-cover"
                />
                <div v-else class="flex size-full items-center justify-center">
                  <ImageIcon class="size-4 text-muted-foreground" />
                </div>
              </div>
              <div class="min-w-0 flex-1">
                <p class="line-clamp-2 text-xs font-medium leading-5">{{ job.prompt }}</p>
                <div
                  class="mt-1 flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground"
                >
                  <Clock3Icon class="size-3" />{{ formatDate(job.createdAt) }}
                  <GitBranchIcon v-if="job.parentJobId" class="ml-1 size-3" />
                  <HeartIcon
                    v-if="job.assets.some((asset) => asset.favorite)"
                    class="ml-1 size-3 fill-current"
                  />
                </div>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger as-child>
                  <Button variant="ghost" size="icon-xs" aria-label="历史操作" @click.stop>
                    <MoreHorizontalIcon />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuGroup>
                    <DropdownMenuItem @click="emit('reuse', job)">
                      <RotateCcwIcon />复用参数
                    </DropdownMenuItem>
                    <DropdownMenuItem variant="destructive" @click="emit('delete', job)">
                      <Trash2Icon />删除
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </CardContent>
        </Card>
      </div>
      <Empty v-else class="mt-20">
        <EmptyHeader>
          <EmptyMedia variant="icon"><HistoryIcon /></EmptyMedia>
          <EmptyTitle>{{ history.length ? '没有匹配的作品' : '还没有作品' }}</EmptyTitle>
          <EmptyDescription>
            {{
              history.length
                ? '尝试其他关键词或关闭收藏筛选。'
                : '完成首次生成后，会在这里建立你的本地作品集。'
            }}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </ScrollArea>
  </div>
</template>
