import type { GeneratedDiffFile } from '@contracts/index'
import { getSampleFileContent } from '@client/fixtures/sample-file-contents'

export type DiffContentSources = {
  editorBuffers: Record<string, string>
  getFileContent?: (path: string) => Promise<string>
}

export type ResolvedDiffFileContent = {
  before: string
  after: string
  contentAvailable: boolean
  usedLegacyPatch: boolean
}

function looksLikeFullFileContent(value: string): boolean {
  const trimmed = value.trim()
  if (trimmed.length < 2) return false
  if (trimmed.startsWith('@@')) return false
  return trimmed.includes('\n') || trimmed.includes('import ') || trimmed.includes('export ')
}

export async function resolveDiffFileContent(
  file: GeneratedDiffFile,
  sources: DiffContentSources,
): Promise<ResolvedDiffFileContent> {
  if (file.changeType === 'create') {
    const after = file.after ?? (file.patch && looksLikeFullFileContent(file.patch) ? file.patch : '')
    return {
      before: '',
      after,
      contentAvailable: after.length > 0,
      usedLegacyPatch: !file.after && Boolean(file.patch && looksLikeFullFileContent(file.patch)),
    }
  }

  if (file.changeType === 'delete') {
    const before = await resolveBeforeText(file, sources)
    return {
      before,
      after: '',
      contentAvailable: before.length > 0,
      usedLegacyPatch: false,
    }
  }

  const before = await resolveBeforeText(file, sources)
  let after = file.after ?? ''
  let usedLegacyPatch = false

  if (!after && file.patch && looksLikeFullFileContent(file.patch)) {
    after = file.patch
    usedLegacyPatch = true
  }

  return {
    before,
    after,
    contentAvailable: before.length > 0 || after.length > 0,
    usedLegacyPatch,
  }
}

async function resolveBeforeText(
  file: GeneratedDiffFile,
  sources: DiffContentSources,
): Promise<string> {
  if (file.before !== undefined) return file.before

  const buffered = sources.editorBuffers[file.path]
  if (buffered !== undefined) return buffered

  if (sources.getFileContent) {
    try {
      return await sources.getFileContent(file.path)
    } catch {
      // Fall through to sample content.
    }
  }

  return getSampleFileContent(file.path)
}

export async function enrichGeneratedDiffFiles(
  files: GeneratedDiffFile[],
  sources: DiffContentSources,
): Promise<GeneratedDiffFile[]> {
  return Promise.all(
    files.map(async (file) => {
      const resolved = await resolveDiffFileContent(file, sources)
      return {
        ...file,
        before: resolved.before || file.before,
        after: resolved.after || file.after,
      }
    }),
  )
}
