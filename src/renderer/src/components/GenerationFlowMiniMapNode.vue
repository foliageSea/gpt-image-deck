<script setup lang="ts">
import type { Dimensions, XYPosition } from '@vue-flow/core'

const props = defineProps<{
  id: string
  position: XYPosition
  dimensions: Dimensions
  selected?: boolean
  imageUrl?: string
  loading?: boolean
}>()

const emit = defineEmits<{
  click: [event: MouseEvent]
  dblclick: [event: MouseEvent]
  mouseenter: [event: MouseEvent]
  mousemove: [event: MouseEvent]
  mouseleave: [event: MouseEvent]
}>()

const clipPathId = `flow-minimap-node-${props.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`
</script>

<template>
  <g
    class="generation-flow-minimap-node"
    :class="{ selected, loading }"
    @click="emit('click', $event)"
    @dblclick="emit('dblclick', $event)"
    @mouseenter="emit('mouseenter', $event)"
    @mousemove="emit('mousemove', $event)"
    @mouseleave="emit('mouseleave', $event)"
  >
    <defs>
      <clipPath :id="clipPathId">
        <rect
          :x="position.x"
          :y="position.y"
          :width="dimensions.width"
          :height="dimensions.height"
          rx="12"
          ry="12"
        />
      </clipPath>
    </defs>
    <rect
      :x="position.x"
      :y="position.y"
      :width="dimensions.width"
      :height="dimensions.height"
      rx="12"
      ry="12"
      class="generation-flow-minimap-node__background"
    />
    <image
      v-if="imageUrl"
      :href="imageUrl"
      :x="position.x"
      :y="position.y"
      :width="dimensions.width"
      :height="dimensions.height"
      preserveAspectRatio="xMidYMid slice"
      :clip-path="`url(#${clipPathId})`"
    />
    <g v-else-if="loading" class="generation-flow-minimap-node__loading">
      <circle
        :cx="position.x + dimensions.width / 2"
        :cy="position.y + dimensions.height / 2"
        r="18"
      />
      <circle
        :cx="position.x + dimensions.width / 2"
        :cy="position.y + dimensions.height / 2"
        r="7"
      />
    </g>
    <path
      v-else
      :d="`M${position.x + dimensions.width * 0.3} ${position.y + dimensions.height * 0.68}l${dimensions.width * 0.17}-${dimensions.height * 0.2} ${dimensions.width * 0.12} ${dimensions.height * 0.12} ${dimensions.width * 0.12}-${dimensions.height * 0.14} ${dimensions.width * 0.2} ${dimensions.height * 0.22}z`"
      class="generation-flow-minimap-node__placeholder"
    />
    <rect
      :x="position.x"
      :y="position.y"
      :width="dimensions.width"
      :height="dimensions.height"
      rx="12"
      ry="12"
      class="generation-flow-minimap-node__border"
    />
  </g>
</template>
