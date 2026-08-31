import type { AppSettings } from '../../../shared/image-types'
import type { Feedback, SettingsForm } from '@/types/app'
import type { ComputedRef, Ref } from 'vue'
import { computed, reactive, ref } from 'vue'
import { toast } from 'vue-sonner'

const defaultSettings: AppSettings = {
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-image-2',
  hasApiKey: false,
  secureStorageAvailable: false
}

export type AppSettingsController = {
  settings: Ref<AppSettings>
  form: SettingsForm
  open: Ref<boolean>
  testing: Ref<boolean>
  connectionFeedback: Ref<Feedback | null>
  backgroundImageUrl: ComputedRef<string | undefined>
  initialize: (nextSettings: AppSettings) => void
  save: () => Promise<void>
  test: () => Promise<void>
  clearCredential: () => Promise<void>
  pickBackground: () => Promise<void>
  clearBackground: () => Promise<void>
}

export function useAppSettings(): AppSettingsController {
  const api = window.imageDeck
  const settings = ref<AppSettings>({ ...defaultSettings })
  const form = reactive<SettingsForm>({ baseUrl: '', model: '', apiKey: '' })
  const open = ref(false)
  const testing = ref(false)
  const connectionFeedback = ref<Feedback | null>(null)
  const backgroundImageUrl = computed(() => settings.value.backgroundImageUrl)

  function initialize(nextSettings: AppSettings): void {
    settings.value = nextSettings
    form.baseUrl = nextSettings.baseUrl
    form.model = nextSettings.model
    if (!nextSettings.hasApiKey) open.value = true
  }

  async function save(): Promise<void> {
    try {
      settings.value = await api.updateSettings({
        baseUrl: form.baseUrl,
        model: form.model
      })
      if (form.apiKey.trim()) {
        const result = await api.setApiKey(form.apiKey)
        settings.value = await api.getSettings()
        form.apiKey = ''
        toast.success(result.message ?? 'API Key 已保存。')
      } else {
        toast.success('连接设置已保存。')
      }
      open.value = false
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '设置保存失败。')
    }
  }

  async function test(): Promise<void> {
    testing.value = true
    connectionFeedback.value = {
      type: 'info',
      title: '正在测试连接',
      message: '正在验证接口地址、API Key 和模型访问权限…'
    }
    try {
      const result = await api.testConnection({
        baseUrl: form.baseUrl,
        model: form.model,
        apiKey: form.apiKey.trim() || undefined
      })
      const message = result.message ?? (result.success ? '连接成功。' : '连接失败。')
      connectionFeedback.value = {
        type: result.success ? 'success' : 'error',
        title: result.success ? '连接成功' : '连接失败',
        message
      }
      result.success ? toast.success(message) : toast.error(message, { duration: 8000 })
    } catch (error) {
      const message = error instanceof Error ? error.message : '连接测试失败。'
      connectionFeedback.value = { type: 'error', title: '连接失败', message }
      toast.error(message, { duration: 8000 })
    } finally {
      testing.value = false
    }
  }

  async function clearCredential(): Promise<void> {
    await api.clearApiKey()
    settings.value = await api.getSettings()
    toast.success('API Key 已清除。')
  }

  async function pickBackground(): Promise<void> {
    try {
      settings.value = await api.pickBackgroundImage()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '背景图片设置失败。')
    }
  }

  async function clearBackground(): Promise<void> {
    try {
      settings.value = await api.clearBackgroundImage()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '背景图片清除失败。')
    }
  }

  return {
    settings,
    form,
    open,
    testing,
    connectionFeedback,
    backgroundImageUrl,
    initialize,
    save,
    test,
    clearCredential,
    pickBackground,
    clearBackground
  }
}
