import { useCallback, useEffect, useMemo, useRef } from 'react'
import type { Monaco } from '@monaco-editor/react'

import { languageForPath } from '../../data/sampleFileContents'
import { MonacoEditor } from '../CodeEditor/monacoEditorLazy'
import type { DiffChangeSite, SideBySideRow } from './diffHighlight'
import type { DiffSyntaxTheme } from './diffSyntaxHighlight'
import styles from './DiffFileView.module.css'

interface Props {
  filePath: string
  before: string
  after: string
  theme: DiffSyntaxTheme
  rows: SideBySideRow[]
  changeSites: DiffChangeSite[]
  activeChangeIndex: number
  beforeLabel: string
  afterLabel: string
}

type MonacoEditorInstance = ReturnType<Monaco['editor']['create']>

function buildBeforeDecorations(
  rows: SideBySideRow[],
  monaco: Monaco,
): Monaco.editor.IModelDeltaDecoration[] {
  const decorations: Monaco.editor.IModelDeltaDecoration[] = []

  for (const row of rows) {
    const line = row.before
    if (!line?.lineNumber) continue
    if (line.lineKind === 'removed') {
      decorations.push({
        range: new monaco.Range(line.lineNumber, 1, line.lineNumber, 1),
        options: {
          isWholeLine: true,
          className: 'projectos-diff-line-removed',
        },
      })
    } else if (line.lineKind === 'changed') {
      decorations.push({
        range: new monaco.Range(line.lineNumber, 1, line.lineNumber, 1),
        options: {
          isWholeLine: true,
          className: 'projectos-diff-line-changed',
        },
      })
    }
  }

  return decorations
}

function buildAfterDecorations(
  rows: SideBySideRow[],
  monaco: Monaco,
): Monaco.editor.IModelDeltaDecoration[] {
  const decorations: Monaco.editor.IModelDeltaDecoration[] = []

  for (const row of rows) {
    const line = row.after
    if (!line?.lineNumber) continue
    if (line.lineKind === 'added') {
      decorations.push({
        range: new monaco.Range(line.lineNumber, 1, line.lineNumber, 1),
        options: {
          isWholeLine: true,
          className: 'projectos-diff-line-added',
        },
      })
    } else if (line.lineKind === 'changed') {
      decorations.push({
        range: new monaco.Range(line.lineNumber, 1, line.lineNumber, 1),
        options: {
          isWholeLine: true,
          className: 'projectos-diff-line-changed',
        },
      })
    }
  }

  return decorations
}

function revealChangeSite(
  site: DiffChangeSite | undefined,
  beforeEditor: MonacoEditorInstance | null,
  afterEditor: MonacoEditorInstance | null,
): void {
  if (!site) return
  if (site.beforeLineNumber != null && beforeEditor) {
    beforeEditor.revealLineInCenter(site.beforeLineNumber)
  }
  if (site.afterLineNumber != null && afterEditor) {
    afterEditor.revealLineInCenter(site.afterLineNumber)
  }
}

const editorOptions = {
  readOnly: true,
  minimap: { enabled: false },
  fontSize: 13,
  lineNumbers: 'on' as const,
  scrollBeyondLastLine: false,
  automaticLayout: true,
  padding: { top: 12 },
  renderValidationDecorations: 'off' as const,
  overviewRulerLanes: 0,
}

export default function DiffMonacoSideBySide({
  filePath,
  before,
  after,
  theme,
  rows,
  changeSites,
  activeChangeIndex,
  beforeLabel,
  afterLabel,
}: Props) {
  const language = useMemo(() => languageForPath(filePath), [filePath])
  const beforeEditorRef = useRef<MonacoEditorInstance | null>(null)
  const afterEditorRef = useRef<MonacoEditorInstance | null>(null)
  const monacoRef = useRef<Monaco | null>(null)
  const beforeDecorationsRef = useRef<string[]>([])
  const afterDecorationsRef = useRef<string[]>([])
  const syncingScroll = useRef(false)
  const editorsReadyRef = useRef({ before: false, after: false })

  const mirrorScroll = (source: 'before' | 'after') => {
    if (syncingScroll.current) return
    const from = source === 'before' ? beforeEditorRef.current : afterEditorRef.current
    const to = source === 'before' ? afterEditorRef.current : beforeEditorRef.current
    if (!from || !to) return
    syncingScroll.current = true
    to.setScrollTop(from.getScrollTop())
    syncingScroll.current = false
  }

  const revealActiveChange = useCallback(() => {
    if (changeSites.length === 0) return
    const site = changeSites[activeChangeIndex]
    revealChangeSite(site, beforeEditorRef.current, afterEditorRef.current)
  }, [activeChangeIndex, changeSites])

  const markEditorReady = (side: 'before' | 'after') => {
    editorsReadyRef.current[side] = true
    if (editorsReadyRef.current.before && editorsReadyRef.current.after) {
      revealActiveChange()
    }
  }

  const mountBefore = (editor: MonacoEditorInstance, monaco: Monaco) => {
    beforeEditorRef.current = editor
    monacoRef.current = monaco
    beforeDecorationsRef.current = editor.deltaDecorations(
      beforeDecorationsRef.current,
      buildBeforeDecorations(rows, monaco),
    )
    editor.onDidScrollChange(() => mirrorScroll('before'))
    markEditorReady('before')
  }

  const mountAfter = (editor: MonacoEditorInstance, monaco: Monaco) => {
    afterEditorRef.current = editor
    monacoRef.current = monaco
    afterDecorationsRef.current = editor.deltaDecorations(
      afterDecorationsRef.current,
      buildAfterDecorations(rows, monaco),
    )
    editor.onDidScrollChange(() => mirrorScroll('after'))
    markEditorReady('after')
  }

  useEffect(() => {
    const monaco = monacoRef.current
    const beforeEditor = beforeEditorRef.current
    const afterEditor = afterEditorRef.current
    if (!monaco || !beforeEditor || !afterEditor) return

    beforeDecorationsRef.current = beforeEditor.deltaDecorations(
      beforeDecorationsRef.current,
      buildBeforeDecorations(rows, monaco),
    )
    afterDecorationsRef.current = afterEditor.deltaDecorations(
      afterDecorationsRef.current,
      buildAfterDecorations(rows, monaco),
    )
  }, [rows])

  useEffect(() => {
    if (!editorsReadyRef.current.before || !editorsReadyRef.current.after) return
    revealActiveChange()
  }, [revealActiveChange])

  return (
    <div className={styles.columns}>
      <div className={styles.column}>
        <div className={styles.colLabel}>{beforeLabel}</div>
        <div className={styles.monacoColumnHost}>
          <MonacoEditor
            height="100%"
            language={language}
            theme={theme}
            value={before}
            options={editorOptions}
            onMount={mountBefore}
          />
        </div>
      </div>
      <div className={styles.column}>
        <div className={styles.colLabel}>{afterLabel}</div>
        <div className={styles.monacoColumnHost}>
          <MonacoEditor
            height="100%"
            language={language}
            theme={theme}
            value={after}
            options={editorOptions}
            onMount={mountAfter}
          />
        </div>
      </div>
    </div>
  )
}
