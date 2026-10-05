import type { Monaco } from '@monaco-editor/react'

type MonacoEditor = ReturnType<Monaco['editor']['create']>

const editors = new Map<string, MonacoEditor>()

export function registerEditor(filePath: string, editor: MonacoEditor): void {
  editors.set(filePath, editor)
}

export function unregisterEditor(filePath: string): void {
  editors.delete(filePath)
}

export function revealPosition(
  filePath: string,
  line: number,
  column = 1,
): boolean {
  const editor = editors.get(filePath)
  if (!editor) return false
  editor.revealLineInCenter(line)
  editor.setPosition({ lineNumber: line, column })
  editor.focus()
  return true
}

export function getRegisteredEditor(filePath: string): MonacoEditor | undefined {
  return editors.get(filePath)
}
