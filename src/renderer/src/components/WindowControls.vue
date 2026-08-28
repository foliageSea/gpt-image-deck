<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

const controls = window.imageDeck.windowControls
const maximized = ref(false)
let removeMaximizedListener: (() => void) | undefined

onMounted(async () => {
  removeMaximizedListener = controls.onMaximizedChange((value) => {
    maximized.value = value
  })
  maximized.value = await controls.isMaximized()
})

onBeforeUnmount(() => removeMaximizedListener?.())

async function toggleMaximize(): Promise<void> {
  maximized.value = await controls.toggleMaximize()
}
</script>

<template>
  <div
    v-if="controls.platform !== 'darwin'"
    class="window-controls flex h-full items-stretch [-webkit-app-region:no-drag]"
  >
    <button
      type="button"
      class="window-control"
      title="最小化"
      aria-label="最小化窗口"
      @click="controls.minimize"
    >
      <span class="minimize-icon" />
    </button>
    <button
      type="button"
      class="window-control"
      :title="maximized ? '还原' : '最大化'"
      :aria-label="maximized ? '还原窗口' : '最大化窗口'"
      @click="toggleMaximize"
    >
      <span :class="maximized ? 'restore-icon' : 'maximize-icon'" />
    </button>
    <button
      type="button"
      class="window-control window-control-close"
      title="关闭"
      aria-label="关闭窗口"
      @click="controls.close"
    >
      <span class="close-icon" />
    </button>
  </div>
</template>

<style scoped>
.window-control {
  display: grid;
  width: 46px;
  place-items: center;
  color: var(--muted-foreground);
  transition:
    color 120ms ease,
    background-color 120ms ease;
}

.window-control:hover {
  color: var(--foreground);
  background: var(--accent);
}

.window-control-close:hover {
  color: white;
  background: #c42b1c;
}

.minimize-icon,
.maximize-icon,
.restore-icon,
.close-icon {
  position: relative;
  display: block;
  width: 11px;
  height: 11px;
}

.minimize-icon::before {
  position: absolute;
  top: 5px;
  left: 1px;
  width: 9px;
  height: 1px;
  content: '';
  background: currentColor;
}

.maximize-icon {
  width: 10px;
  height: 10px;
  border: 1px solid currentColor;
}

.restore-icon::before,
.restore-icon::after {
  position: absolute;
  width: 8px;
  height: 8px;
  content: '';
  border: 1px solid currentColor;
}

.restore-icon::before {
  top: 1px;
  right: 1px;
}

.restore-icon::after {
  bottom: 1px;
  left: 1px;
  background: var(--card);
}

.close-icon::before,
.close-icon::after {
  position: absolute;
  top: 5px;
  left: 0;
  width: 11px;
  height: 1px;
  content: '';
  background: currentColor;
}

.close-icon::before {
  transform: rotate(45deg);
}

.close-icon::after {
  transform: rotate(-45deg);
}
</style>
