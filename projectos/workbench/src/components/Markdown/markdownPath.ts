export type MarkdownEditorViewMode = 'source' | 'preview' | 'split'
export type MarkdownDiffViewMode = 'text' | 'preview'

export function isMarkdownPath(path: string): boolean {
  const lower = path.toLowerCase()
  return lower.endsWith('.md') || lower.endsWith('.markdown')
}
