import type { PinComposerHubReference } from '@contracts/spatial-pin'

export type ReferenceLibraryTab = 'files' | 'media' | 'links' | 'repo'

export const REFERENCE_FILE_TYPES = [
  'pdf',
  'txt',
  'md',
  'doc',
  'docx',
  'rtf',
  'csv',
  'json',
] as const

export const REFERENCE_MEDIA_TYPES = [
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'mp4',
  'mov',
  'mp3',
  'wav',
] as const

export type ReferenceFileType = (typeof REFERENCE_FILE_TYPES)[number]
export type ReferenceMediaType = (typeof REFERENCE_MEDIA_TYPES)[number]

function pathExt(path: string | undefined): string {
  if (!path) return ''
  const base = path.split(/[/?#]/).pop() ?? ''
  const dot = base.lastIndexOf('.')
  if (dot < 0) return ''
  return base.slice(dot + 1).toLowerCase()
}

export function referenceSourcePath(ref: PinComposerHubReference): string {
  switch (ref.kind) {
    case 'file':
      return ref.path
    case 'image':
    case 'video':
    case 'audio':
      return ref.assetPath ?? ref.url ?? ''
    case 'url':
    case 'github':
      return ref.url
  }
}

export function matchesReferenceExt(
  ref: PinComposerHubReference,
  ext: string,
): boolean {
  const normalized = ext.replace(/^\./, '').toLowerCase()
  if (normalized === 'jpg' || normalized === 'jpeg') {
    const found = pathExt(referenceSourcePath(ref))
    return found === 'jpg' || found === 'jpeg'
  }
  return pathExt(referenceSourcePath(ref)) === normalized
}

export function isFileLibraryRef(ref: PinComposerHubReference): boolean {
  return ref.kind === 'file'
}

export function isMediaLibraryRef(ref: PinComposerHubReference): boolean {
  return ref.kind === 'image' || ref.kind === 'video' || ref.kind === 'audio'
}

export function isLinksLibraryRef(ref: PinComposerHubReference): boolean {
  return ref.kind === 'url'
}

export function isRepoLibraryRef(ref: PinComposerHubReference): boolean {
  return ref.kind === 'github'
}

export function filterReferencesForTab(
  references: readonly PinComposerHubReference[],
  tab: ReferenceLibraryTab,
  typeFilter: string | null,
  folderId: string | null,
): PinComposerHubReference[] {
  return references.filter((ref) => {
    switch (tab) {
      case 'files':
        if (!isFileLibraryRef(ref)) return false
        return typeFilter ? matchesReferenceExt(ref, typeFilter) : true
      case 'media':
        if (!isMediaLibraryRef(ref)) return false
        return typeFilter ? matchesReferenceExt(ref, typeFilter) : true
      case 'links': {
        if (ref.kind !== 'url') return false
        if (folderId === '__unfiled__') return !ref.folderId
        if (folderId) return ref.folderId === folderId
        return true
      }
      case 'repo': {
        if (ref.kind !== 'github') return false
        if (folderId === '__unfiled__') return !ref.folderId
        if (folderId) return ref.folderId === folderId
        return true
      }
    }
  })
}
