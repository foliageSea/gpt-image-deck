<script setup lang="ts">
import type { Edge, Node, NodeMouseEvent } from '@vue-flow/core'
import type { GenerationJob, Project } from '../../../shared/image-types'
import type { GenerationFlowNodeData } from './GenerationFlowNode.vue'
import dagre from '@dagrejs/dagre'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { VueFlow } from '@vue-flow/core'
import { MiniMap } from '@vue-flow/minimap'
import {
  FolderIcon,
  GitBranchIcon,
  ImagePlusIcon,
  LayoutDashboardIcon,
  PlusIcon
} from '@lucide/vue'
import { computed } from 'vue'
import GenerationFlowNode from './GenerationFlowNode.vue'
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

const props = defineProps<{
  history: GenerationJob[]
  projects: Project[]
  currentProjectId: string
  selectedJobId?: string
  projectBusy?: boolean
}>()

const isMac = window.imageDeck.windowControls.platform === 'darwin'

const emit = defineEmits<{
  close: []
  select: [job: GenerationJob]
  create: [job: GenerationJob, variant: boolean]
  createRoot: []
  switchProject: [projectId: unknown]
  manageProjects: []
  delete: [job: GenerationJob]
}>()

const graph = computed(() => {
  const layout = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}))
  layout.setGraph({ rankdir: 'LR', ranksep: 100, nodesep: 48, marginx: 60, marginy: 60 })

  for (const job of props.history) layout.setNode(job.id, { width: 288, height: 150 })
  for (const job of props.history) {
    if (job.parentJobId && layout.hasNode(job.parentJobId)) {
      layout.setEdge(job.parentJobId, job.id)
    }
  }
  dagre.layout(layout)

  const nodes: Node<GenerationFlowNodeData>[] = props.history.map((job) => {
    const point = layout.node(job.id)
    return {
      id: job.id,
      type: 'generation',
      position: { x: point.x - 144, y: point.y - 75 },
      selected: job.id === props.selectedJobId,
      data: {
        job,
        onSelect: (value) => {
          emit('select', value)
          emit('close')
        },
        onContinue: (value, variant) => emit('create', value, variant),
        onDelete: (value) => emit('delete', value)
      }
    }
  })
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
  return { nodes, edges }
})

function selectNode({ node }: NodeMouseEvent): void {
  const job = props.history.find((item) => item.id === node.id)
  if (job) emit('select', job)
}
</script>

<template>
  <section class="flex h-screen flex-col bg-background">
    <header
      :class="[
        'flex h-14 shrink-0 items-center gap-3 border-b bg-card/80 backdrop-blur-xl [-webkit-app-region:drag]',
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
        <p class="text-xs text-muted-foreground">拖动画布探索分支，选择任意节点继续生成</p>
      </div>
      <Badge variant="outline" class="ml-2">{{ history.length }} 个节点</Badge>
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
        <span class="hidden text-xs text-muted-foreground sm:inline"
          >双击节点可在工作台查看作品</span
        >
        <Button variant="secondary" size="sm" @click="emit('close')">
          <LayoutDashboardIcon data-icon="inline-start" />工作台模式
        </Button>
        <WindowControls :class="!isMac && 'ml-1'" />
      </div>
    </header>

    <div class="relative min-h-0 flex-1">
      <VueFlow
        :key="history.map((job) => job.id).join(':')"
        :nodes="graph.nodes"
        :edges="graph.edges"
        :min-zoom="0.15"
        :max-zoom="2"
        fit-view-on-init
        :nodes-connectable="false"
        :delete-key-code="null"
        class="generation-flow"
        @node-click="selectNode"
      >
        <template #node-generation="{ data, selected }">
          <GenerationFlowNode :data="data" :selected="selected" />
        </template>
        <Background :gap="24" :size="1.25" pattern-color="var(--border)" />
        <MiniMap pannable zoomable />
        <Controls :show-interactive="false" />
      </VueFlow>
      <div
        v-if="!history.length"
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
            <p class="text-sm leading-6 text-muted-foreground">
              先在工作台生成一组图片，后续即可从任意节点继续创作和探索分支。
            </p>
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
  background: var(--background);
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
  color: var(--foreground);
}

.generation-flow .vue-flow__minimap-mask {
  fill: color-mix(in oklab, var(--background) 75%, transparent);
}
</style>
