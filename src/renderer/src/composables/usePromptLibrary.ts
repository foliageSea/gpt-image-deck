import type { PromptTemplate, PromptTemplateInput } from '../../../shared/image-types'
import type { Ref } from 'vue'
import { ref } from 'vue'
import { toast } from 'vue-sonner'

export type PromptLibraryController = {
  prompts: Ref<PromptTemplate[]>
  open: Ref<boolean>
  initialize: (nextPrompts: PromptTemplate[]) => void
  create: (input: PromptTemplateInput) => Promise<void>
  update: (id: string, input: PromptTemplateInput) => Promise<void>
  remove: (id: string) => Promise<void>
}

export function usePromptLibrary(): PromptLibraryController {
  const api = window.imageDeck
  const prompts = ref<PromptTemplate[]>([])
  const open = ref(false)

  function initialize(nextPrompts: PromptTemplate[]): void {
    prompts.value = nextPrompts
  }

  async function create(input: PromptTemplateInput): Promise<void> {
    try {
      prompts.value = await api.createPrompt(input)
      toast.success('提示词已保存。')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '提示词保存失败。')
    }
  }

  async function update(id: string, input: PromptTemplateInput): Promise<void> {
    try {
      prompts.value = await api.updatePrompt(id, input)
      toast.success('提示词已更新。')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '提示词更新失败。')
    }
  }

  async function remove(id: string): Promise<void> {
    try {
      prompts.value = await api.deletePrompt(id)
      toast.success('提示词已删除。')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '提示词删除失败。')
    }
  }

  return { prompts, open, initialize, create, update, remove }
}
