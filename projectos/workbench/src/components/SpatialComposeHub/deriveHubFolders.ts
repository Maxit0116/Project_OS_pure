import type { PinComposerHubReference } from '@contracts/spatial-pin'

/** Parent directory of a workspace-relative or absolute file path. */
function parentDir(path: string): string | null {
  const normalized = path.replace(/\\/g, '/').replace(/\/+$/, '')
  const idx = normalized.lastIndexOf('/')
  if (idx <= 0) return null
  const parent = normalized.slice(0, idx)
  return parent.length > 0 ? parent : null
}

/**
 * Infer folder scopes from file/media references so vibe users don't
 * need to manually add every Scope → Folders path.
 */
export function deriveFolderScopesFromReferences(
  references: readonly PinComposerHubReference[],
): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const ref of references) {
    let path: string | undefined
    if (ref.kind === 'file') path = ref.path
    else if (
      ref.kind === 'image' ||
      ref.kind === 'video' ||
      ref.kind === 'audio'
    ) {
      path = ref.assetPath
    }
    if (!path) continue
    const folder = parentDir(path)
    if (!folder || seen.has(folder)) continue
    seen.add(folder)
    out.push(folder)
    if (out.length >= 20) break
  }
  return out
}

/** Union explicit scopes with derived ones (explicit order preserved). */
export function mergeFolderScopes(
  explicit: readonly string[],
  derived: readonly string[],
  max = 40,
): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const path of [...explicit, ...derived]) {
    const trimmed = path.trim()
    if (!trimmed || seen.has(trimmed)) continue
    seen.add(trimmed)
    out.push(trimmed)
    if (out.length >= max) break
  }
  return out
}
