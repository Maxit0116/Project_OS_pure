import { useEffect, useMemo, useRef, useState } from 'react'

import type { RenderLine, SideBySideRow } from './diffHighlight'
import { lineTextFromRenderLine } from './diffHighlight'
import {
  colorizeDiffLines,
  escapeDiffLineHtml,
  type DiffSyntaxTheme,
} from './diffSyntaxHighlight'
import styles from './DiffFileView.module.css'

type ColumnSide = 'before' | 'after'

interface Props {
  label: string
  rows: SideBySideRow[]
  side: ColumnSide
  filePath: string
  theme: DiffSyntaxTheme
  scrollRef?: React.RefObject<HTMLDivElement>
  onScroll?: (scrollTop: number) => void
}

function lineClassName(line: RenderLine | null): string {
  if (!line) return styles.linePlaceholder

  const classes = [styles.line]
  if (line.lineKind === 'equal') classes.push(styles.lineEqual)
  if (line.lineKind === 'changed') classes.push(styles.lineChanged)
  if (line.lineKind === 'added') classes.push(styles.lineAdded)
  if (line.lineKind === 'removed') classes.push(styles.lineRemoved)
  return classes.join(' ')
}

function renderLineHtml(
  line: RenderLine | null,
  lineId: string,
  highlighted: Map<string, string>,
): string {
  if (!line) return ''
  const text = lineTextFromRenderLine(line)
  return highlighted.get(lineId) ?? escapeDiffLineHtml(text)
}

export default function DiffHighlightedColumn({
  label,
  rows,
  side,
  filePath,
  theme,
  scrollRef,
  onScroll,
}: Props) {
  const localRef = useRef<HTMLDivElement>(null)
  const bodyRef = scrollRef ?? localRef
  const [highlighted, setHighlighted] = useState<Map<string, string>>(() => new Map())

  const lineEntries = useMemo(
    () => rows.flatMap((row, index) => {
      const line = side === 'before' ? row.before : row.after
      if (!line) return []
      return [{ id: `${side}-${index}`, text: lineTextFromRenderLine(line) }]
    }),
    [rows, side],
  )

  useEffect(() => {
    let cancelled = false
    void colorizeDiffLines(lineEntries, filePath, theme).then((map) => {
      if (!cancelled) setHighlighted(map)
    })
    return () => {
      cancelled = true
    }
  }, [lineEntries, filePath, theme])

  return (
    <div className={styles.column}>
      <div className={styles.colLabel}>{label}</div>
      <div
        ref={bodyRef}
        className={styles.codeBody}
        onScroll={(event) => onScroll?.(event.currentTarget.scrollTop)}
      >
        <pre className={styles.code}>
          {rows.map((row, index) => {
            const line = side === 'before' ? row.before : row.after
            const lineNumber = line?.lineNumber
            const lineId = `${side}-${index}`

            return (
              <div key={lineId} className={lineClassName(line)}>
                <span className={styles.lineNumber}>
                  {lineNumber ?? ''}
                </span>
                <code className={styles.lineContent}>
                  {line ? (
                    <span
                      className="monaco-colorized"
                      dangerouslySetInnerHTML={{
                        __html: renderLineHtml(line, lineId, highlighted),
                      }}
                    />
                  ) : (
                    <span className={styles.placeholderGlyph} aria-hidden="true" />
                  )}
                </code>
              </div>
            )
          })}
        </pre>
      </div>
    </div>
  )
}
