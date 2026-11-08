import { useCallback, useEffect, useMemo, useRef } from 'react'
import type { Monaco } from '@monaco-editor/react'
import type { editor } from 'monaco-editor'

import { languageForPath } from '../../data/sampleFileContents'
import { codeEditorOptions } from '../CodeEditor/editorPresentation'
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

function collectChangeLineNumbers(
  site: DiffChangeSite | undefined,
  rows: SideBySideRow[],
): { before: number[]; after: number[] } {
  if (!site) return { before: [], after: [] }

  const before = new Set<number>()
  const after = new Set<number>()

  for (let rowIndex = site.rowIndex; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex]
    if (!row) break
    const isChange =
      row.before === null ||
      row.after === null ||
      row.before.lineKind !== 'equal' ||
      row.after.lineKind !== 'equal'
    if (!isChange) break
    if (row.before?.lineNumber != null) before.add(row.before.lineNumber)
    if (row.after?.lineNumber != null) after.add(row.after.lineNumber)
  }

  return {
    before: [...before],
    after: [...after],
  }
}

function buildBeforeDecorations(
  rows: SideBySideRow[],
  monaco: Monaco,
  activeLines: number[],
): editor.IModelDeltaDecoration[] {
  const decorations: editor.IModelDeltaDecoration[] = []
  const activeSet = new Set(activeLines)

  for (const row of rows) {
    const line = row.before
    if (!line?.lineNumber) continue

    const isRemoved = line.lineKind === 'removed' || line.lineKind === 'changed'
    if (!isRemoved) continue

    const isActive = activeSet.has(line.lineNumber)
    decorations.push({
      range: new monaco.Range(line.lineNumber, 1, line.lineNumber, 1),
      options: {
        isWholeLine: true,
        className: isActive
          ? 'projectos-diff-line-removed projectos-diff-line-active'
          : 'projectos-diff-line-removed',
        linesDecorationsClassName: 'projectos-diff-gutter-removed',
        overviewRuler: {
          color: '#c94f47',
          position: monaco.editor.OverviewRulerLane.Full,
        },
      },
    })
  }

  return decorations
}

function buildAfterDecorations(
  rows: SideBySideRow[],
  monaco: Monaco,
  activeLines: number[],
): editor.IModelDeltaDecoration[] {
  const decorations: editor.IModelDeltaDecoration[] = []
  const activeSet = new Set(activeLines)

  for (const row of rows) {
    const line = row.after
    if (!line?.lineNumber) continue

    const isAdded = line.lineKind === 'added' || line.lineKind === 'changed'
    if (!isAdded) continue

    const isActive = activeSet.has(line.lineNumber)
    decorations.push({
      range: new monaco.Range(line.lineNumber, 1, line.lineNumber, 1),
      options: {
        isWholeLine: true,
        className: isActive
          ? 'projectos-diff-line-added projectos-diff-line-active'
          : 'projectos-diff-line-added',
        linesDecorationsClassName: 'projectos-diff-gutter-added',
        overviewRuler: {
          color: '#3a9a58',
          position: monaco.editor.OverviewRulerLane.Full,
        },
      },
    })
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
  ...codeEditorOptions,
  readOnly: true,
  renderValidationDecorations: 'off' as const,
  overviewRulerLanes: 2,
  renderLineHighlight: 'none' as const,
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
  const rowsRef = useRef(rows)
  rowsRef.current = rows

  const activeLines = useMemo(
    () => collectChangeLineNumbers(changeSites[activeChangeIndex], rows),
    [activeChangeIndex, changeSites, rows],
  )

  const mirrorScroll = (source: 'before' | 'after') => {
    if (syncingScroll.current) return
    const from = source === 'before' ? beforeEditorRef.current : afterEditorRef.current
    const to = source === 'before' ? afterEditorRef.current : beforeEditorRef.current
    if (!from || !to) return
    syncingScroll.current = true
    to.setScrollTop(from.getScrollTop())
    syncingScroll.current = false
  }

  const applyDecorations = useCallback((active: { before: number[]; after: number[] }) => {
    const monaco = monacoRef.current
    const beforeEditor = beforeEditorRef.current
    const afterEditor = afterEditorRef.current
    if (!monaco || !beforeEditor || !afterEditor) return

    beforeDecorationsRef.current = beforeEditor.deltaDecorations(
      beforeDecorationsRef.current,
      buildBeforeDecorations(rowsRef.current, monaco, active.before),
    )
    afterDecorationsRef.current = afterEditor.deltaDecorations(
      afterDecorationsRef.current,
      buildAfterDecorations(rowsRef.current, monaco, active.after),
    )
  }, [])

  const revealActiveChange = useCallback(() => {
    if (changeSites.length === 0) return
    const site = changeSites[activeChangeIndex]
    const scheduleReveal = () => {
      revealChangeSite(site, beforeEditorRef.current, afterEditorRef.current)
    }
    requestAnimationFrame(() => {
      scheduleReveal()
      requestAnimationFrame(scheduleReveal)
    })
  }, [activeChangeIndex, changeSites])

  const markEditorReady = (side: 'before' | 'after') => {
    editorsReadyRef.current[side] = true
    if (editorsReadyRef.current.before && editorsReadyRef.current.after) {
      applyDecorations(activeLines)
      revealActiveChange()
    }
  }

  const mountBefore = (editor: MonacoEditorInstance, monaco: Monaco) => {
    beforeEditorRef.current = editor
    monacoRef.current = monaco
    editor.onDidScrollChange(() => mirrorScroll('before'))
    markEditorReady('before')
  }

  const mountAfter = (editor: MonacoEditorInstance, monaco: Monaco) => {
    afterEditorRef.current = editor
    monacoRef.current = monaco
    editor.onDidScrollChange(() => mirrorScroll('after'))
    markEditorReady('after')
  }

  useEffect(() => {
    if (!editorsReadyRef.current.before || !editorsReadyRef.current.after) return
    applyDecorations(activeLines)
  }, [activeLines, applyDecorations, rows])

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
