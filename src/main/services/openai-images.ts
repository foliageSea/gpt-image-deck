import type {
  ConnectionTestInput,
  GenerationJob,
  GenerationRequest,
  TokenUsage
} from '../../shared/image-types'
import { createReadStream } from 'node:fs'
import { randomUUID } from 'node:crypto'
import OpenAI, { APIError, toFile } from 'openai'
import { getApiKey } from './credentials'
import { getStoredSettings, normalizeSettings } from './settings-store'
import {
  deleteJobAssets,
  getReferences,
  persistGeneratedAsset,
  persistGeneratedBytes
} from './asset-store'
import { addHistory } from './history-store'

const validSizes = new Set(['auto', '1024x1024', '1536x1024', '1024x1536'])

function validate(request: GenerationRequest): void {
  if (!request.projectId) throw new Error('请先选择项目。')
  const prompt = request.prompt.trim()
  if (!prompt || prompt.length > 32000) throw new Error('提示词长度应为 1 到 32000 个字符。')
  if (!Number.isInteger(request.n) || request.n < 1 || request.n > 10)
    throw new Error('生成数量应为 1 到 10。')
  if (!validSizes.has(request.size) && !/^\d{2,4}x\d{2,4}$/.test(request.size)) {
    throw new Error('图片尺寸无效。')
  }
  if (request.background === 'transparent' && request.format === 'jpeg') {
    throw new Error('透明背景仅支持 PNG 或 WebP。')
  }
  if (request.compression < 0 || request.compression > 100) throw new Error('压缩率应为 0 到 100。')
}

function mapError(error: unknown): string {
  if (error instanceof APIError) {
    if (error.status === 401) return 'API Key 无效，请检查连接设置。'
    if (error.status === 403) {
      if (error.message.toLowerCase().includes('group')) {
        return '当前 API Key 所属分组未启用图片生成。请在接口供应商后台开启 Images/GPT Image 权限，或切换到有权限的分组或 API Key。'
      }
      return '当前账户没有图片生成权限。使用 OpenAI 官方接口时，请检查项目模型权限并完成组织验证；使用兼容接口时，请联系供应商开通图片生成。'
    }
    if (error.status === 429) return '请求过于频繁或账户额度不足，请稍后重试。'
    if (error.code === 'moderation_blocked') return '请求未通过安全检查，请调整提示词或参考图片。'
    if (error.status === 404)
      return '接口或模型不存在，请检查 Base URL 是否包含正确的 API 路径，以及模型名称是否正确。'
    return error.message || `图片接口返回错误（${error.status}）。`
  }
  if (error instanceof Error) {
    if (error.name === 'AbortError' || error.message.toLowerCase().includes('timeout')) {
      return '接口请求超时，请检查 Base URL、网络连接或服务状态。'
    }
    return error.message
  }
  return '图片生成失败。'
}

export function getImageErrorMessage(error: unknown): string {
  return mapError(error)
}

export async function testConnection(input: ConnectionTestInput): Promise<void> {
  const apiKey = input.apiKey?.trim() || (await getApiKey())
  if (!apiKey) throw new Error('请先设置 API Key。')
  const settings = normalizeSettings(input)

  try {
    const response = await fetch(`${settings.baseUrl}/images/generations`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(20_000)
    })
    const body = await response.text()

    if (response.status === 401) throw new Error('API Key 无效或未被接口接受。')
    if (response.status === 403) {
      throw new Error(
        body.toLowerCase().includes('group')
          ? '接口可访问，但当前 API Key 所属分组未启用图片生成。'
          : '接口可访问，但当前 API Key 没有图片生成权限。'
      )
    }
    if (response.status === 404) {
      throw new Error(`未找到生图接口：${settings.baseUrl}/images/generations`)
    }
    if (response.status >= 500) throw new Error(`图片服务暂时不可用（HTTP ${response.status}）。`)
    if (response.ok) return

    // Missing prompt/model errors prove that the route and credential are accepted.
    if (response.status === 400 || response.status === 422) return
    throw new Error(body || `接口探测失败（HTTP ${response.status}）。`)
  } catch (error) {
    if (error instanceof Error && !error.message.toLowerCase().includes('fetch')) throw error
    throw new Error(mapError(error))
  }
}

export async function generateImage(request: GenerationRequest): Promise<GenerationJob> {
  validate(request)
  const apiKey = await getApiKey()
  if (!apiKey) throw new Error('请先设置 API Key。')
  const settings = await getStoredSettings()
  const client = new OpenAI({ apiKey, baseURL: settings.baseUrl, timeout: 300_000, maxRetries: 0 })
  const id = randomUUID()

  try {
    const common = {
      model: settings.model,
      prompt: request.prompt.trim(),
      n: request.n,
      size: request.size,
      quality: request.quality,
      output_format: request.format,
      output_compression: request.format === 'png' ? undefined : request.compression,
      background: request.background
    }
    let response

    if (request.referenceIds.length) {
      const references = getReferences(request.referenceIds)
      const files = await Promise.all(
        references.map((reference) =>
          toFile(createReadStream(reference.path), reference.name, { type: reference.mimeType })
        )
      )
      response = await client.images.edit({
        ...common,
        image: files,
        input_fidelity: request.inputFidelity
      })
    } else {
      response = await client.images.generate(common)
    }

    const results = response.data ?? []
    if (!results.length) throw new Error('接口没有返回图片数据。')
    const assetResults = await Promise.allSettled(
      results.map(async (item, index) => {
        if (item.b64_json) return persistGeneratedAsset(id, item.b64_json, request.format, index)
        if (item.url) {
          const download = await fetch(item.url, { signal: AbortSignal.timeout(60_000) })
          if (!download.ok) throw new Error(`图片下载失败（HTTP ${download.status}）。`)
          return persistGeneratedBytes(
            id,
            new Uint8Array(await download.arrayBuffer()),
            request.format,
            index
          )
        }
        throw new Error('接口返回结果中没有 b64_json 或 url。')
      })
    )
    const assets = assetResults.flatMap((result) =>
      result.status === 'fulfilled' ? [result.value] : []
    )
    if (!assets.length) {
      await deleteJobAssets(id)
      const failure = assetResults.find((result) => result.status === 'rejected')
      throw failure && failure.status === 'rejected' ? failure.reason : new Error('图片保存失败。')
    }
    const rawUsage = 'usage' in response ? response.usage : undefined
    const usage: TokenUsage | undefined = rawUsage
      ? {
          totalTokens: rawUsage.total_tokens,
          inputTokens: rawUsage.input_tokens,
          outputTokens: rawUsage.output_tokens
        }
      : undefined
    const { projectId, referenceIds, parentJobId, sourceAssetId, ...generationOptions } = request
    const job: GenerationJob = {
      id,
      projectId,
      createdAt: new Date().toISOString(),
      status: assets.length === request.n ? 'completed' : 'partial',
      prompt: request.prompt.trim(),
      parentJobId,
      sourceAssetId,
      request: { ...generationOptions, referenceCount: referenceIds.length },
      assets,
      usage
    }
    try {
      await addHistory(job)
    } catch (error) {
      await deleteJobAssets(id)
      throw error
    }
    return job
  } catch (error) {
    throw new Error(mapError(error))
  }
}
