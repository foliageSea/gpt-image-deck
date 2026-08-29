<script setup lang="ts">
import type { GeneratedAsset } from '../../../shared/image-types'
import { CopyIcon, DownloadIcon, GitBranchIcon, HeartIcon, SparklesIcon } from '@lucide/vue'
import PhotoSwipeLightbox from 'photoswipe/lightbox'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Button } from '@/components/ui/button'

const props = defineProps<{
  open: boolean
  assets: GeneratedAsset[]
  assetId?: string
  imageSize?: string
}>()

const emit = defineEmits<{
  'update:open': [open: boolean]
  select: [asset: GeneratedAsset]
  favorite: [asset: GeneratedAsset]
  variant: [asset: GeneratedAsset]
  continue: [asset: GeneratedAsset]
  copy: [asset: GeneratedAsset]
  save: [asset: GeneratedAsset]
}>()

const active = ref(false)
const activeAssetId = ref<string>()
const activeAsset = computed(() => props.assets.find((asset) => asset.id === activeAssetId.value))
let lightbox: PhotoSwipeLightbox | undefined

function getDimensions(): { width: number; height: number } {
  const match = props.imageSize?.match(/^(\d+)x(\d+)$/)
  return match
    ? { width: Number(match[1]), height: Number(match[2]) }
    : { width: 1024, height: 1024 }
}

function loadDimensions(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight })
    image.onerror = reject
    image.src = src
  })
}

async function openPreview(): Promise<void> {
  if (!lightbox || !props.assets.length || lightbox.pswp) return
  const index = Math.max(
    0,
    props.assets.findIndex((asset) => asset.id === props.assetId)
  )
  const fallbackDimensions = getDimensions()
  const slides = await Promise.all(
    props.assets.map(async (asset) => {
      const dimensions = await loadDimensions(asset.url).catch(() => fallbackDimensions)
      return {
        src: asset.url,
        width: dimensions.width,
        height: dimensions.height,
        alt: asset.name,
        assetId: asset.id
      }
    })
  )
  if (!props.open || !lightbox || lightbox.pswp) return
  activeAssetId.value = props.assets[index].id
  lightbox.loadAndOpen(index, slides)
}

onMounted(() => {
  lightbox = new PhotoSwipeLightbox({
    pswpModule: () => import('photoswipe'),
    bgOpacity: 0.94,
    wheelToZoom: true,
    closeOnVerticalDrag: true,
    paddingFn: () => ({ top: 48, right: 24, bottom: 96, left: 24 }),
    closeTitle: '关闭预览',
    zoomTitle: '缩放图片',
    arrowPrevTitle: '上一张',
    arrowNextTitle: '下一张',
    errorMsg: '图片加载失败'
  })
  lightbox.on('afterInit', () => {
    active.value = true
  })
  lightbox.on('change', () => {
    const assetId = lightbox?.pswp?.currSlide?.data.assetId
    const asset = props.assets.find((item) => item.id === assetId)
    if (!asset) return
    activeAssetId.value = asset.id
    emit('select', asset)
  })
  lightbox.on('close', () => {
    active.value = false
    emit('update:open', false)
  })
  lightbox.init()
  if (props.open) openPreview()
})

onBeforeUnmount(() => lightbox?.destroy())

watch(
  () => props.open,
  (open) => {
    if (open) openPreview()
    else lightbox?.pswp?.close()
  }
)
</script>

<template>
  <Teleport v-if="active && activeAsset" to=".pswp">
    <div
      class="image-preview-actions absolute inset-x-0 bottom-0 z-[100001] flex min-h-20 items-center justify-between gap-4 border-t border-white/10 bg-black/75 px-5 py-3 backdrop-blur-xl"
      @pointerdown.stop
      @click.stop
    >
      <div class="min-w-0">
        <p class="truncate text-sm font-medium text-white">{{ activeAsset.name }}</p>
        <p class="mt-0.5 text-xs text-white/55">滚轮或双击缩放 · 拖拽平移 · 方向键切换</p>
      </div>
      <div class="flex shrink-0 flex-wrap justify-end gap-2">
        <Button variant="secondary" @click="emit('favorite', activeAsset)">
          <HeartIcon data-icon="inline-start" :class="activeAsset.favorite && 'fill-current'" />
          {{ activeAsset.favorite ? '已收藏' : '收藏' }}
        </Button>
        <Button variant="secondary" @click="emit('variant', activeAsset)">
          <SparklesIcon data-icon="inline-start" />生成变体
        </Button>
        <Button @click="emit('continue', activeAsset)">
          <GitBranchIcon data-icon="inline-start" />继续创作
        </Button>
        <Button variant="secondary" @click="emit('copy', activeAsset)">
          <CopyIcon data-icon="inline-start" />复制图片
        </Button>
        <Button @click="emit('save', activeAsset)">
          <DownloadIcon data-icon="inline-start" />保存图片
        </Button>
      </div>
    </div>
  </Teleport>
</template>
