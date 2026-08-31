<script setup lang="ts">
import type { AppSettings } from '../../../shared/image-types'
import type { Feedback, SettingsForm } from '@/types/app'
import { CircleAlertIcon, CircleCheckIcon, ImageIcon, LoaderCircleIcon } from '@lucide/vue'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'

defineProps<{
  settings: AppSettings
  testing: boolean
  connectionFeedback: Feedback | null
}>()

const open = defineModel<boolean>('open', { required: true })
const form = defineModel<SettingsForm>('form', { required: true })

defineEmits<{
  pickBackground: []
  clearBackground: []
  clearCredential: []
  test: []
  save: []
}>()
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>连接设置</DialogTitle>
      </DialogHeader>
      <FieldGroup>
        <Field>
          <FieldLabel for="api-key">API Key</FieldLabel>
          <Input
            id="api-key"
            v-model="form.apiKey"
            type="password"
            :placeholder="settings.hasApiKey ? '已安全保存，输入可替换' : 'sk-…'"
          />
        </Field>
        <Field>
          <FieldLabel for="base-url">Base URL</FieldLabel>
          <Input
            id="base-url"
            v-model="form.baseUrl"
            placeholder="https://api.openai.com 或 https://api.openai.com/v1"
          />
        </Field>
        <Field>
          <FieldLabel for="model">模型名称</FieldLabel>
          <Input id="model" v-model="form.model" placeholder="gpt-image-2" />
        </Field>
        <Field>
          <FieldLabel>窗口背景</FieldLabel>
          <div class="flex items-center gap-2">
            <Button variant="outline" type="button" @click="$emit('pickBackground')">
              <ImageIcon data-icon="inline-start" />选择图片
            </Button>
            <Button
              v-if="settings.backgroundImageUrl"
              variant="ghost"
              type="button"
              @click="$emit('clearBackground')"
            >
              恢复默认
            </Button>
          </div>
        </Field>
      </FieldGroup>
      <Alert
        v-if="connectionFeedback"
        :variant="connectionFeedback.type === 'error' ? 'destructive' : 'default'"
      >
        <CircleAlertIcon v-if="connectionFeedback.type === 'error'" />
        <CircleCheckIcon v-else-if="connectionFeedback.type === 'success'" />
        <LoaderCircleIcon v-else class="animate-spin" />
        <AlertTitle>{{ connectionFeedback.title }}</AlertTitle>
        <AlertDescription>{{ connectionFeedback.message }}</AlertDescription>
      </Alert>
      <DialogFooter class="sm:justify-between">
        <Button
          v-if="settings.hasApiKey"
          variant="ghost"
          class="text-destructive"
          @click="$emit('clearCredential')"
        >
          清除 Key
        </Button>
        <div class="ml-auto flex gap-2">
          <Button variant="outline" :disabled="testing" @click="$emit('test')">
            <LoaderCircleIcon
              v-if="testing"
              data-icon="inline-start"
              class="animate-spin"
            />测试连接
          </Button>
          <Button @click="$emit('save')">保存设置</Button>
        </div>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
