import type { GenerationJob } from '../../shared/image-types'
import { describe, expect, it } from 'vitest'
import {
  archiveAssetPath,
  parseProjectArchiveManifest,
  PROJECT_ARCHIVE_KIND,
  PROJECT_ARCHIVE_VERSION,
  remapImportedProject,
  uniqueImportedProjectName
} from './project-archive'

const ids = {
  project: '11111111-1111-4111-8111-111111111111',
  parent: '22222222-2222-4222-8222-222222222222',
  child: '33333333-3333-4333-8333-333333333333',
  asset: '44444444-4444-4444-8444-444444444444'
}

function job(overrides: Partial<GenerationJob> = {}): GenerationJob {
  return {
    id: ids.parent,
    projectId: ids.project,
    createdAt: '2026-08-29T00:00:00.000Z',
    status: 'completed',
    prompt: 'A test image',
    request: {
      prompt: 'A test image',
      n: 1,
      size: '1024x1024',
      quality: 'high',
      format: 'png',
      compression: 90,
      background: 'auto',
      inputFidelity: 'low',
      referenceCount: 0
    },
    assets: [
      {
        id: ids.asset,
        name: 'image-1.png',
        mimeType: 'image/png',
        size: 123,
        url: `image-deck://asset/${ids.asset}`,
        favorite: true
      }
    ],
    ...overrides
  }
}

function manifest(): ReturnType<typeof parseProjectArchiveManifest> {
  return {
    kind: PROJECT_ARCHIVE_KIND,
    version: PROJECT_ARCHIVE_VERSION,
    appVersion: '1.0.0',
    exportedAt: '2026-08-29T01:00:00.000Z',
    project: {
      id: ids.project,
      name: '测试项目',
      createdAt: '2026-08-29T00:00:00.000Z'
    },
    jobs: [
      job(),
      job({
        id: ids.child,
        parentJobId: ids.parent,
        sourceAssetId: ids.asset,
        assets: []
      })
    ]
  }
}

describe('project archive manifest', () => {
  it('validates and normalizes persisted asset URLs', () => {
    const value = manifest()
    value.jobs[0].assets[0].url = 'https://untrusted.example/image.png'
    const parsed = parseProjectArchiveManifest(value)
    expect(parsed.jobs[0].assets[0].url).toBe(`image-deck://asset/${ids.asset}`)
  })

  it('rejects path traversal and dangling relationships', () => {
    const traversal = manifest()
    traversal.jobs[0].assets[0].name = '../image.png'
    expect(() => parseProjectArchiveManifest(traversal)).toThrow('文件名')

    const dangling = manifest()
    dangling.jobs[1].parentJobId = '55555555-5555-4555-8555-555555555555'
    expect(() => parseProjectArchiveManifest(dangling)).toThrow('父历史记录引用')
  })

  it('rejects unsupported archive versions and duplicate IDs', () => {
    expect(() => parseProjectArchiveManifest({ ...manifest(), version: 2 })).toThrow('版本')
    const duplicate = manifest()
    duplicate.jobs[1].id = ids.parent
    expect(() => parseProjectArchiveManifest(duplicate)).toThrow('重复 ID')
  })
})

describe('project import remapping', () => {
  it('remaps project, job, asset, parent, and source IDs', () => {
    const generated = [
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
    ]
    const parsed = parseProjectArchiveManifest(manifest())
    const remapped = remapImportedProject(parsed, ['测试项目'], () => generated.shift()!)
    expect(remapped.project).toMatchObject({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      name: '测试项目 副本'
    })
    expect(remapped.jobs[1].parentJobId).toBe(remapped.jobs[0].id)
    expect(remapped.jobs[1].sourceAssetId).toBe(remapped.jobs[0].assets[0].id)
    expect(remapped.jobs[0].assets[0].url).toBe(
      `image-deck://asset/${remapped.jobs[0].assets[0].id}`
    )
    expect(remapped.jobs.every((value) => value.projectId === remapped.project.id)).toBe(true)
  })

  it('creates bounded, case-insensitively unique copy names', () => {
    expect(uniqueImportedProjectName('项目', ['项目 副本', '项目 副本 2'])).toBe('项目 副本 3')
    expect(uniqueImportedProjectName('A'.repeat(50), [])).toHaveLength(50)
  })

  it('only creates safe archive asset paths', () => {
    expect(archiveAssetPath(ids.parent, 'image-1.png')).toBe(`assets/${ids.parent}/image-1.png`)
    expect(() => archiveAssetPath(ids.parent, '../image.png')).toThrow('路径')
  })
})
