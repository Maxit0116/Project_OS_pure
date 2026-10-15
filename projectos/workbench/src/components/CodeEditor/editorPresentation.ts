import type { editor } from 'monaco-editor'

export const EDITOR_FONT_FAMILY = "ui-monospace, 'SF Mono', Menlo, monospace"

export const codeEditorOptions: editor.IStandaloneEditorConstructionOptions = {
  minimap: { enabled: false },
  fontSize: 13,
  fontFamily: EDITOR_FONT_FAMILY,
  fontLigatures: true,
  lineNumbers: 'on',
  scrollBeyondLastLine: false,
  automaticLayout: true,
  padding: { top: 12 },
  bracketPairColorization: { enabled: true },
  guides: { indentation: true, bracketPairs: true },
  renderWhitespace: 'selection',
  smoothScrolling: true,
  cursorSmoothCaretAnimation: 'on',
  'semanticHighlighting.enabled': true,
}
