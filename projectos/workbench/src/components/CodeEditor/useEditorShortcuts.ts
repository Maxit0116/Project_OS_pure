import { useEffect, useRef } from 'react'
import { isMarkdownPath } from '../Markdown/markdownPath'
import { useWorkbenchStore } from '../../state/workbenchStore'
import { getActiveEditorFilePath } from '../CodeEditor/editorPaneHelpers'

const CHORD_WINDOW_MS = 1200

export function useEditorShortcuts(): void {
  const editorPanes = useWorkbenchStore((s) => s.editorPanes)
  const focusedEditorPaneId = useWorkbenchStore((s) => s.focusedEditorPaneId)
  const editorSplitDirection = useWorkbenchStore((s) => s.editorSplitDirection)
  const saveEditorFile = useWorkbenchStore((s) => s.saveEditorFile)
  const isEditorDirty = useWorkbenchStore((s) => s.isEditorDirty)
  const markdownEditorViewModes = useWorkbenchStore((s) => s.markdownEditorViewModes)
  const setMarkdownEditorViewMode = useWorkbenchStore((s) => s.setMarkdownEditorViewMode)
  const chordPendingRef = useRef(false)
  const chordTimerRef = useRef<number | null>(null)

  useEffect(() => {
    const clearChord = () => {
      chordPendingRef.current = false
      if (chordTimerRef.current !== null) {
        window.clearTimeout(chordTimerRef.current)
        chordTimerRef.current = null
      }
    }

    const onKeyDown = (event: KeyboardEvent) => {
      const activeFile = getActiveEditorFilePath({
        editorPanes,
        focusedEditorPaneId,
        editorSplitDirection,
      })

      const isChordStart =
        (event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === 'k'
      if (isChordStart) {
        chordPendingRef.current = true
        if (chordTimerRef.current !== null) window.clearTimeout(chordTimerRef.current)
        chordTimerRef.current = window.setTimeout(clearChord, CHORD_WINDOW_MS)
        return
      }

      if (
        chordPendingRef.current &&
        !event.metaKey &&
        !event.ctrlKey &&
        event.key.toLowerCase() === 'v' &&
        activeFile &&
        isMarkdownPath(activeFile)
      ) {
        event.preventDefault()
        clearChord()
        setMarkdownEditorViewMode(activeFile, 'split')
        return
      }

      if (chordPendingRef.current && event.key !== 'Meta' && event.key !== 'Control') {
        clearChord()
      }

      const isMarkdownPreviewToggle =
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        event.key.toLowerCase() === 'v'

      if (isMarkdownPreviewToggle && activeFile && isMarkdownPath(activeFile)) {
        event.preventDefault()
        const current = markdownEditorViewModes[activeFile] ?? 'source'
        setMarkdownEditorViewMode(activeFile, current === 'preview' ? 'source' : 'preview')
        return
      }

      const isSave = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's'
      if (!isSave) return

      if (!activeFile || !isEditorDirty(activeFile)) return

      event.preventDefault()
      void saveEditorFile(activeFile)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      clearChord()
    }
  }, [
    editorPanes,
    focusedEditorPaneId,
    editorSplitDirection,
    saveEditorFile,
    isEditorDirty,
    markdownEditorViewModes,
    setMarkdownEditorViewMode,
  ])
}
