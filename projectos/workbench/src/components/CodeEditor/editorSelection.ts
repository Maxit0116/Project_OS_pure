export interface EditorSelectionPin {
  path: string
  startLine: number
  endLine: number
  contentHash: string
  sliceHash: string
  text: string
}

let current: EditorSelectionPin | null = null
const listeners = new Set<() => void>()

export function getEditorSelection(): EditorSelectionPin | null {
  return current
}

export function subscribeEditorSelection(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function setEditorSelection(next: EditorSelectionPin | null): void {
  current = next
  for (const listener of listeners) listener()
}

export async function hashEditorText(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  const hex = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  return `sha256:${hex}`
}
