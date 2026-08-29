<script setup lang="ts">
import type { Edge, Node, NodeMouseEvent, VueFlowStore } from '@vue-flow/core'
import type { Graph } from '@dagrejs/dagre'
import type { GenerationJob, Project } from '../../../shared/image-types'
import type { GenerationFlowNodeData } from './GenerationFlowNode.vue'
import type { GenerationFlowLoadingNodeData } from './GenerationFlowLoadingNode.vue'
import dagre from '@dagrejs/dagre'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { VueFlow } from '@vue-flow/core'
import { MiniMap } from '@vue-flow/minimap'
import {
  FolderIcon,
  FocusIcon,
  GitBranchIcon,
  ImagePlusIcon,
  LayoutDashboardIcon,
  LayoutGridIcon,
  PlusIcon,
  Settings2Icon
} from '@lucide/vue'
import { computed, nextTick, shallowRef } from 'vue'
import GenerationFlowNode from './GenerationFlowNode.vue'
import GenerationFlowLoadingNode from './GenerationFlowLoadingNode.vue'
import WindowControls from './WindowControls.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

const props = defineProps<{
  history: GenerationJob[]
  projects: Project[]
  currentProjectId: string
  selectedJobId?: string
  projectBusy?: boolean
  backgroundImageUrl?: string
  pendingGeneration?: {
    id: string
    parentJobId?: string
    prompt: string
    cancelling: boolean
  }
}>()

const isMac = window.imageDeck.windowControls.platform === 'darwin'
const flow = shallowRef<VueFlowStore>()

const emit = defineEmits<{
  close: []
  select: [job: GenerationJob]
  preview: [job: GenerationJob]
  create: [job: GenerationJob, variant: boolean]
  createRoot: []
  switchProject: [projectId: unknown]
  manageProjects: []
  delete: [job: GenerationJob]
  cancelGeneration: []
  openSettings: []
}>()

function createLayout(): Graph {
  const layout = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}))
  layout.setGraph({ rankdir: 'LR', ranksep: 100, nodesep: 48, marginx: 60, marginy: 60 })

  for (const job of props.history) layout.setNode(job.id, { width: 288, height: 150 })
  if (props.pendingGeneration) {
    layout.setNode(props.pendingGeneration.id, { width: 288, height: 150 })
  }
  for (const job of props.history) {
    if (job.parentJobId && layout.hasNode(job.parentJobId)) {
      layout.setEdge(job.parentJobId, job.id)
    }
  }
  if (props.pendingGeneration?.parentJobId && layout.hasNode(props.pendingGeneration.parentJobId)) {
    layout.setEdge(props.pendingGeneration.parentJobId, props.pendingGeneration.id)
  }
  dagre.layout(layout)

  return layout
}

const graph = computed(() => {
  const layout = createLayout()

  const nodes: Node<GenerationFlowNodeData | GenerationFlowLoadingNodeData>[] = props.history.map(
    (job) => {
      const point = layout.node(job.id)
      return {
        id: job.id,
        type: 'generation',
        position: { x: point.x - 144, y: point.y - 75 },
        selected: job.id === props.selectedJobId,
        data: {
          job,
          onSelect: (value) => emit('preview', value),
          onContinue: (value, variant) => emit('create', value, variant),
          onDelete: (value) => emit('delete', value)
        }
      }
    }
  )
  if (props.pendingGeneration) {
    const point = layout.node(props.pendingGeneration.id)
    nodes.push({
      id: props.pendingGeneration.id,
      type: 'generation-loading',
      position: { x: point.x - 144, y: point.y - 75 },
      selectable: false,
      data: {
        prompt: props.pendingGeneration.prompt,
        hasParent: Boolean(props.pendingGeneration.parentJobId),
        cancelling: props.pendingGeneration.cancelling,
        onCancel: () => emit('cancelGeneration')
      }
    })
  }
  const edges: Edge[] = props.history.flatMap((job) =>
    job.parentJobId && layout.hasNode(job.parentJobId)
      ? [
          {
            id: `${job.parentJobId}-${job.id}`,
            source: job.parentJobId,
            target: job.id,
            type: 'smoothstep',
            animated: job.id === props.selectedJobId
          }
        ]
      : []
  )
  if (props.pendingGeneration?.parentJobId && layout.hasNode(props.pendingGeneration.parentJobId)) {
    edges.push({
      id: `${props.pendingGeneration.parentJobId}-${props.pendingGeneration.id}`,
      source: props.pendingGeneration.parentJobId,
      target: props.pendingGeneration.id,
      type: 'smoothstep',
      animated: true
    })
  }
  return { nodes, edges }
})

function setFlow(instance: VueFlowStore): void {
  flow.value = instance
}

async function fitCanvas(duration = 300): Promise<void> {
  await nextTick()
  await flow.value?.fitView({ padding: 0.16, minZoom: 0.15, maxZoom: 1.2, duration })
}

async function formatLayout(): Promise<void> {
  if (!flow.value || (!props.history.length && !props.pendingGeneration)) return

  const layout = createLayout()
  for (const node of flow.value.getNodes.value) {
    const point = layout.node(node.id)
    if (point) {
      flow.value.updateNode(node.id, { position: { x: point.x - 144, y: point.y - 75 } })
    }
  }
  await fitCanvas(420)
}

function selectNode({ node }: NodeMouseEvent): void {
  const job = props.history.find((item) => item.id === node.id)
  if (job) emit('select', job)
}
</script>

<template>
  <section
    class="window-background flex h-screen flex-col bg-background"
    :class="backgroundImageUrl && 'has-custom-background'"
    :style="
      backgroundImageUrl ? { '--window-background-image': `url('${backgroundImageUrl}')` } : {}
    "
  >
    <header
      :class="[
        'relative z-10 flex h-14 shrink-0 items-center gap-3 border-b bg-card/80 backdrop-blur-xl [-webkit-app-region:drag]',
        isMac ? 'pl-24' : 'pl-5'
      ]"
    >
      <div
        class="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground"
      >
        <GitBranchIcon />
      </div>
      <div>
        <h2 class="text-sm font-semibold">创作流程</h2>
      </div>
      <Badge variant="outline" class="ml-2">
        {{ history.length + (pendingGeneration ? 1 : 0) }} 个节点
      </Badge>
      <div
        :class="[
          'ml-auto flex h-full items-center gap-2 [-webkit-app-region:no-drag]',
          isMac && 'pr-3'
        ]"
      >
        <Select
          :model-value="currentProjectId"
          :disabled="projectBusy"
          @update:model-value="emit('switchProject', $event)"
        >
          <SelectTrigger class="w-32 sm:w-40" aria-label="当前项目">
            <FolderIcon />
            <SelectValue placeholder="选择项目" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem v-for="project in projects" :key="project.id" :value="project.id">
                {{ project.name }}
              </SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
        <Button
          variant="ghost"
          size="icon"
          aria-label="管理项目"
          :disabled="projectBusy"
          @click="emit('manageProjects')"
        >
          <PlusIcon />
        </Button>
        <Button size="sm" :disabled="projectBusy" @click="emit('createRoot')">
          <ImagePlusIcon data-icon="inline-start" />新建节点
        </Button>
        <Button variant="secondary" size="sm" @click="emit('close')">
          <LayoutDashboardIcon data-icon="inline-start" />工作台模式
        </Button>
        <Button variant="ghost" size="icon" aria-label="连接设置" @click="emit('openSettings')">
          <Settings2Icon />
        </Button>
        <WindowControls :class="!isMac && 'ml-1'" />
      </div>
    </header>

    <div class="relative z-10 min-h-0 flex-1">
      <VueFlow
        :key="`${history.map((job) => job.id).join(':')}:${pendingGeneration?.id ?? ''}`"
        :nodes="graph.nodes"
        :edges="graph.edges"
        :min-zoom="0.15"
        :max-zoom="2"
        fit-view-on-init
        :nodes-connectable="false"
        :delete-key-code="null"
        class="generation-flow"
        @pane-ready="setFlow"
        @node-click="selectNode"
      >
        <template #node-generation="{ data, selected }">
          <GenerationFlowNode :data="data" :selected="selected" />
        </template>
        <template #node-generation-loading="{ data }">
          <GenerationFlowLoadingNode :data="data" />
        </template>
        <Background :gap="24" :size="1.25" pattern-color="var(--border)" />
        <MiniMap pannable zoomable />
        <Controls :show-interactive="false" />
      </VueFlow>
      <TooltipProvider>
        <div
          class="absolute left-4 top-4 flex items-center gap-1 rounded-xl border bg-card/90 p-1 shadow-lg backdrop-blur-xl"
          aria-label="画布辅助工具"
        >
          <Tooltip>
            <TooltipTrigger as-child>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="适应画布"
                :disabled="!history.length && !pendingGeneration"
                @click="fitCanvas()"
              >
                <FocusIcon />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">适应画布</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger as-child>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="整理节点布局"
                :disabled="!history.length && !pendingGeneration"
                @click="formatLayout"
              >
                <LayoutGridIcon />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">整理节点布局</TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
      <div
        v-if="!history.length && !pendingGeneration"
        class="pointer-events-none absolute inset-0 flex items-center justify-center p-6"
      >
        <div
          class="pointer-events-auto flex max-w-sm flex-col items-center gap-4 rounded-2xl border bg-card/90 p-8 text-center shadow-2xl shadow-background/40 backdrop-blur-xl"
        >
          <div
            class="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground"
          >
            <ImagePlusIcon />
          </div>
          <div class="flex flex-col gap-1.5">
            <h3 class="text-base font-semibold">创建第一个流程节点</h3>
          </div>
          <Button @click="emit('createRoot')">
            <ImagePlusIcon data-icon="inline-start" />新建节点
          </Button>
        </div>
      </div>
    </div>
  </section>
</template>

<style>
@import '@vue-flow/core/dist/style.css';
@import '@vue-flow/core/dist/theme-default.css';
@import '@vue-flow/controls/dist/style.css';
@import '@vue-flow/minimap/dist/style.css';

.generation-flow {
  --vf-node-bg: var(--card);
  --vf-node-color: var(--foreground);
  --vf-handle: var(--primary);
  --vf-edge: var(--muted-foreground);
  background: color-mix(in oklab, var(--background) 48%, transparent);
}

.generation-flow .vue-flow__edge-path {
  stroke-width: 1.5;
}

.generation-flow .vue-flow__controls,
.generation-flow .vue-flow__minimap {
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--card);
}

.generation-flow .vue-flow__controls-button {
  border-color: var(--border);
  background: var(--card);
  color: var(--foreground) !important;
}

.generation-flow .vue-flow__controls-button svg {
  color: var(--foreground) !important;
  stroke: currentColor;
}

.generation-flow .vue-flow__controls-button:hover {
  background: var(--accent);
  color: var(--accent-foreground) !important;
}

.generation-flow .vue-flow__minimap-mask {
  fill: color-mix(in oklab, var(--background) 75%, transparent);
}
</style>
