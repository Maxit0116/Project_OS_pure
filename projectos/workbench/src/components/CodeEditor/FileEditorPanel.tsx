import { Suspense, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import type { Monaco } from '@monaco-editor/react'
import { languageForPath } from '../../data/sampleFileContents'
import { useI18n } from '../../i18n'
import { useWorkbenchStore } from '../../state/workbenchStore'
import { useDiagnosticsStore } from '../../state/diagnosticsStore'
import Button from '../ui/Button'
import PanelResizeHandle from '../layout/PanelResizeHandle'
import MarkdownPreview from '../Markdown/MarkdownPreview'
import MarkdownViewToggle from '../Markdown/MarkdownViewToggle'
import { isMarkdownPath } from '../Markdown/markdownPath'
import { findHeadingLine as findHeadingLineInContent } from '../Markdown/markdownLinkUtils'
import { useMarkdownEditorScrollSync } from '../Markdown/useMarkdownEditorScrollSync'
import { registerEditor, revealPosition, unregisterEditor } from './editorNavigation'
import { MonacoEditor } from './monacoEditorLazy'
import styles from './FileEditorPanel.module.css'

const MIN_SPLIT_PERCENT = 25
const MAX_SPLIT_PERCENT = 75
const DEFAULT_SPLIT_PERCENT = 50

interface Props {
  filePath: string
  content: string
  onChange: (value: string) => void
  showHeader?: boolean
}

export default function FileEditorPanel({ filePath, content, onChange, showHeader = true }: Props) {
  const { ts } = useI18n()
  const language = languageForPath(filePath)
  const resolvedTheme = useWorkbenchStore((s) => s.resolvedTheme)
  const isEditorDirty = useWorkbenchStore((s) => s.isEditorDirty)
  const saveEditorFile = useWorkbenchStore((s) => s.saveEditorFile)
  const selectFile = useWorkbenchStore((s) => s.selectFile)
  const markdownViewMode = useWorkbenchStore(
    (s) => s.markdownEditorViewModes[filePath] ?? 'source',
  )
  const setMarkdownEditorViewMode = useWorkbenchStore((s) => s.setMarkdownEditorViewMode)
  const diagnosticItems = useDiagnosticsStore((s) => s.items)
  const dirty = isEditorDirty(filePath)
  const isMarkdown = isMarkdownPath(filePath)
  const showMonaco = !isMarkdown || markdownViewMode === 'source' || markdownViewMode === 'split'
  const showPreview = isMarkdown && (markdownViewMode === 'preview' || markdownViewMode === 'split')
  const previewContent = useDeferredValue(content)
  const diagnostics = useMemo(
    () => diagnosticItems.filter((item) => item.filePath === filePath),
    [diagnosticItems, filePath],
  )
  const monacoTheme = resolvedTheme === 'dark' ? 'vs-dark' : 'vs'
  const monacoRef = useRef<Monaco | null>(null)
  const editorRef = useRef<ReturnType<Monaco['editor']['create']> | null>(null)
  const splitBodyRef = useRef<HTMLDivElement>(null)
  const previewScrollRef = useRef<HTMLDivElement>(null)
  const [sourceSplitPercent, setSourceSplitPercent] = useState(DEFAULT_SPLIT_PERCENT)
  const [editorMounted, setEditorMounted] = useState(false)

  useMarkdownEditorScrollSync({
    filePath,
    enabled: isMarkdown && markdownViewMode === 'split' && editorMounted,
    previewScrollRef,
  })

  useEffect(() => {
    const monaco = monacoRef.current
    const editor = editorRef.current
    if (!monaco || !editor || !showMonaco) return
    const model = editor.getModel()
    if (!model) return
    monaco.editor.setModelMarkers(
      model,
      'projectos-diagnostics',
      diagnostics.map((item) => ({
        startLineNumber: item.line,
        startColumn: item.column,
        endLineNumber: item.endLine ?? item.line,
        endColumn: item.endColumn ?? item.column + 1,
        message: item.message,
        severity:
          item.severity === 'error'
            ? monaco.MarkerSeverity.Error
            : item.severity === 'warning'
              ? monaco.MarkerSeverity.Warning
              : item.severity === 'info'
                ? monaco.MarkerSeverity.Info
                : monaco.MarkerSeverity.Hint,
        source: item.source,
        code: item.code != null ? String(item.code) : undefined,
      })),
    )
  }, [diagnostics, filePath, content, showMonaco])

  useEffect(() => {
    return () => {
      unregisterEditor(filePath)
    }
  }, [filePath])

  const onSplitDelta = useCallback((delta: number) => {
    const body = splitBodyRef.current
    if (!body || body.clientWidth <= 0) return
    const deltaPercent = (delta / body.clientWidth) * 100
    setSourceSplitPercent((prev) =>
      Math.min(MAX_SPLIT_PERCENT, Math.max(MIN_SPLIT_PERCENT, prev + deltaPercent)),
    )
  }, [])

  const revealSourceLine = useCallback(
    (line: number) => {
      if (markdownViewMode === 'preview') {
        setMarkdownEditorViewMode(filePath, 'split')
      }
      window.setTimeout(() => {
        revealPosition(filePath, line)
      }, 0)
    },
    [filePath, markdownViewMode, setMarkdownEditorViewMode],
  )

  const openDocument = useCallback(
    (path: string, headingSlug?: string) => {
      void selectFile(path).then(() => {
        if (!headingSlug) return
        const buffer = useWorkbenchStore.getState().editorBuffers[path]
        const line = buffer ? findHeadingLineInContent(buffer, headingSlug) : null
        if (line) revealSourceLine(line)
      })
    },
    [revealSourceLine, selectFile],
  )

  const preview = showPreview ? (
    <div className={styles.previewPane} ref={previewScrollRef}>
      <MarkdownPreview
        content={previewContent}
        documentPath={filePath}
        onRevealSourceLine={revealSourceLine}
        onOpenDocument={openDocument}
        previewScrollRef={previewScrollRef}
      />
    </div>
  ) : null

  const monacoEditor = showMonaco ? (
    <Suspense fallback={<div className={styles.loading}>{ts('editor.loading')}</div>}>
      <MonacoEditor
        height="100%"
        language={language}
        theme={monacoTheme}
        value={content}
        onChange={(v) => onChange(v ?? '')}
        onMount={(editor, monaco) => {
          editorRef.current = editor
          monacoRef.current = monaco
          registerEditor(filePath, editor)
          setEditorMounted(true)
        }}
        options={{
          minimap: { enabled: false },
          fontSize: 13,
          lineNumbers: 'on',
          scrollBeyondLastLine: false,
          automaticLayout: true,
          padding: { top: 12 },
        }}
      />
    </Suspense>
  ) : null

  return (
    <div className={styles.panel}>
      {showHeader ? (
        <div className={styles.header}>
          <span className={styles.path}>{filePath}</span>
          <div className={styles.headerActions}>
            {dirty ? <span className={styles.unsaved}>{ts('editor.unsaved')}</span> : null}
            <Button size="sm" onClick={() => void saveEditorFile(filePath)} disabled={!dirty}>
              {ts('editor.save')}
            </Button>
          </div>
        </div>
      ) : null}

      {isMarkdown ? (
        <div className={styles.markdownToolbar}>
          <MarkdownViewToggle
            variant="editor"
            mode={markdownViewMode}
            onChange={(mode) => setMarkdownEditorViewMode(filePath, mode)}
          />
        </div>
      ) : null}

      <div className={styles.editorBody}>
        {markdownViewMode === 'preview' && isMarkdown ? (
          preview
        ) : markdownViewMode === 'split' && isMarkdown ? (
          <div className={styles.splitRow} ref={splitBodyRef}>
            <div className={styles.splitSource} style={{ width: `${sourceSplitPercent}%` }}>
              {monacoEditor}
              <PanelResizeHandle
                edge="east"
                onDelta={onSplitDelta}
                ariaLabel={ts('editor.resizeSplit')}
              />
            </div>
            <div className={styles.splitPreview}>{preview}</div>
          </div>
        ) : (
          monacoEditor
        )}
      </div>
    </div>
  )
}
