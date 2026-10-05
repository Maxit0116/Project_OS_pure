import { useEffect, useRef, type RefObject } from 'react'
import type { Monaco } from '@monaco-editor/react'
import { getRegisteredEditor } from '../CodeEditor/editorNavigation'

type MonacoEditor = ReturnType<Monaco['editor']['create']>

interface Options {
  filePath: string
  enabled: boolean
  previewScrollRef: RefObject<HTMLDivElement>
}

export function useMarkdownEditorScrollSync({
  filePath,
  enabled,
  previewScrollRef,
}: Options): void {
  const syncingRef = useRef(false)

  useEffect(() => {
    if (!enabled) return

    const editor = getRegisteredEditor(filePath)
    const preview = previewScrollRef.current
    if (!editor || !preview) return

    const syncPreviewFromEditor = () => {
      if (syncingRef.current) return
      const layout = editor.getLayoutInfo()
      const maxEditorScroll = Math.max(1, editor.getScrollHeight() - layout.height)
      const ratio = editor.getScrollTop() / maxEditorScroll
      const maxPreviewScroll = Math.max(0, preview.scrollHeight - preview.clientHeight)
      syncingRef.current = true
      preview.scrollTop = ratio * maxPreviewScroll
      syncingRef.current = false
    }

    const syncEditorFromPreview = () => {
      if (syncingRef.current) return
      const layout = editor.getLayoutInfo()
      const maxPreviewScroll = Math.max(1, preview.scrollHeight - preview.clientHeight)
      const ratio = preview.scrollTop / maxPreviewScroll
      const maxEditorScroll = Math.max(0, editor.getScrollHeight() - layout.height)
      syncingRef.current = true
      editor.setScrollTop(ratio * maxEditorScroll)
      syncingRef.current = false
    }

    const editorDisposable = editor.onDidScrollChange(syncPreviewFromEditor)
    preview.addEventListener('scroll', syncEditorFromPreview, { passive: true })

    return () => {
      editorDisposable.dispose()
      preview.removeEventListener('scroll', syncEditorFromPreview)
    }
  }, [enabled, filePath, previewScrollRef])
}
