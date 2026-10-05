import type { Editor } from '@tiptap/react'

export function getSelectionPreviewText(editor: Editor, maxLength = 40): string {
  const { from, to, empty } = editor.state.selection
  if (empty) return ''
  const text = editor.state.doc.textBetween(from, to, ' ')
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength)}…`
}

export function collapseEditorSelection(editor: Editor): void {
  const { to } = editor.state.selection
  editor.commands.setTextSelection(to)
}

export function blurActiveNoteEditor(): void {
  const active = document.activeElement
  if (active instanceof HTMLElement && active.classList.contains('ProseMirror')) {
    active.blur()
  }
}

export function selectionHasNoteHighlight(editor: Editor): boolean {
  const { empty } = editor.state.selection
  if (empty) return false
  return editor.isActive('noteHighlight')
}

export function selectionHasTextColor(editor: Editor): boolean {
  const { from, to, empty } = editor.state.selection
  if (empty) return false

  let hasColor = false
  editor.state.doc.nodesBetween(from, to, (node) => {
    if (!node.isText || hasColor) return
    hasColor = node.marks.some(
      (mark) => mark.type.name === 'textStyle' && typeof mark.attrs.color === 'string' && mark.attrs.color.length > 0,
    )
  })
  return hasColor
}

export function applyNoteHighlight(editor: Editor): void {
  editor.chain().focus().setMark('noteHighlight').run()
  collapseEditorSelection(editor)
}

export function clearNoteHighlight(editor: Editor): void {
  editor.chain().focus().unsetMark('noteHighlight').run()
  collapseEditorSelection(editor)
}

export function applyTextColor(editor: Editor, color: string): void {
  editor.chain().focus().setColor(color).run()
  collapseEditorSelection(editor)
}

export function clearTextColor(editor: Editor): void {
  editor.chain().focus().unsetColor().run()
  collapseEditorSelection(editor)
}
