import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import type { GeneratedDiffFile } from '@contracts/index'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { useI18n } from '../../i18n'
import { useWorkbenchStore } from '../../state/workbenchStore'
import PanelResizeHandle from '../layout/PanelResizeHandle'
import MarkdownViewToggle from '../Markdown/MarkdownViewToggle'
import type { MarkdownDiffViewMode } from '../Markdown/markdownPath'
import { isMarkdownPath } from '../Markdown/markdownPath'
import Button from '../ui/Button'
import { editorThemeName } from '../CodeEditor/editorTheme'
import {
  buildSideBySideDiffForFile,
  collectDiffChangeSites,
  countDiffStats,
} from './diffHighlight'
import { DiffMonacoSideBySide } from './diffMonacoEditorLazy'
import DiffMarkdownPreviewColumn from './DiffMarkdownPreviewColumn'
import { MIN_DIFF_BODY_HEIGHT, maxDiffBodyHeight } from './diffViewLayout'
import { createDiffScrollSynchronizer } from './diffScrollSynchronizer'
import styles from './DiffFileView.module.css'

type Props = {
  file: GeneratedDiffFile
  bodyHeight: number
  onBodyHeightDelta: (delta: number) => void
  markdownViewMode?: MarkdownDiffViewMode
  onMarkdownViewModeChange?: (mode: MarkdownDiffViewMode) => void
}

function isLegacyPatchSummary(patch: string | undefined): boolean {
  if (!patch) return false
  const trimmed = patch.trim()
  return trimmed.startsWith('@@') || trimmed.startsWith('# Planned change')
}

export default function DiffFileView({
  file,
  bodyHeight,
  onBodyHeightDelta,
  markdownViewMode = 'text',
  onMarkdownViewModeChange,
}: Props) {
  const { ts } = useI18n()
  const resolvedTheme = useWorkbenchStore((s) => s.resolvedTheme)
  const syntaxTheme = editorThemeName(resolvedTheme)
  const beforeRef = useRef<HTMLDivElement>(null)
  const afterRef = useRef<HTMLDivElement>(null)
  const scrollSynchronizerRef = useRef<ReturnType<
    typeof createDiffScrollSynchronizer
  > | null>(null)
  if (scrollSynchronizerRef.current === null) {
    scrollSynchronizerRef.current = createDiffScrollSynchronizer()
  }

  useEffect(() => () => {
    scrollSynchronizerRef.current?.dispose()
  }, [])

  const isMarkdown = isMarkdownPath(file.path)

  const before = file.before ?? ''
  const after = file.after ?? ''
  const hasRenderableDiff = before.length > 0 || after.length > 0
  const showLegacyPatch = Boolean(file.patch) && (!hasRenderableDiff || isLegacyPatchSummary(file.patch))

  const rows = useMemo(
    () => buildSideBySideDiffForFile(before, after, file.changeType),
    [before, after, file.changeType],
  )

  const stats = useMemo(() => countDiffStats(rows), [rows])
  const changeSites = useMemo(() => collectDiffChangeSites(rows), [rows])
  const [activeChangeIndex, setActiveChangeIndex] = useState(0)
  const showMonacoDiff = hasRenderableDiff && !(isMarkdown && markdownViewMode === 'preview')

  useEffect(() => {
    setActiveChangeIndex(0)
  }, [file.path, changeSites.length])

  const canGoPrev = showMonacoDiff && changeSites.length > 0 && activeChangeIndex > 0
  const canGoNext = showMonacoDiff && changeSites.length > 0 &&
    activeChangeIndex < changeSites.length - 1

  const mirrorScroll = (source: 'before' | 'after', scrollTop: number) => {
    const target = source === 'before' ? afterRef.current : beforeRef.current
    scrollSynchronizerRef.current?.sync(source, scrollTop, target)
  }

  const showUnavailableNotice =
    file.changeType === 'modify' && !hasRenderableDiff

  const emptyLabel = ts('diff.emptySide')

  return (
    <div className={styles.file}>
      <div className={styles.fileHeader}>
        <div className={styles.fileHeaderMeta}>
          <span className={styles.path}>{file.path}</span>
          <span className={styles.changeType}>{file.changeType}</span>
        </div>
        <div className={styles.fileHeaderActions}>
          {showMonacoDiff && changeSites.length > 0 ? (
            <div className={styles.changeNav}>
              <Button
                variant="ghost"
                size="sm"
                disabled={!canGoPrev}
                aria-label={ts('diff.prevChange')}
                title={ts('diff.prevChange')}
                onClick={() => setActiveChangeIndex((index) => Math.max(0, index - 1))}
              >
                <ChevronUp size={14} aria-hidden />
              </Button>
              <span className={styles.changeNavPosition}>
                {ts('diff.changePosition', {
                  current: activeChangeIndex + 1,
                  total: changeSites.length,
                })}
              </span>
              <Button
                variant="ghost"
                size="sm"
                disabled={!canGoNext}
                aria-label={ts('diff.nextChange')}
                title={ts('diff.nextChange')}
                onClick={() => setActiveChangeIndex((index) =>
                  Math.min(changeSites.length - 1, index + 1))}
              >
                <ChevronDown size={14} aria-hidden />
              </Button>
            </div>
          ) : null}
          {isMarkdown && onMarkdownViewModeChange ? (
            <MarkdownViewToggle
              variant="diff"
              mode={markdownViewMode}
              onChange={onMarkdownViewModeChange}
            />
          ) : null}
          {(stats.added > 0 || stats.removed > 0) && (
            <span className={styles.stats}>
              {ts('diff.stats', { added: stats.added, removed: stats.removed })}
            </span>
          )}
        </div>
      </div>

      {showUnavailableNotice && (
        <div className={styles.unavailable}>{ts('diff.contentUnavailable')}</div>
      )}

      {showLegacyPatch && file.patch && (
        <pre className={styles.patch}>
          <span className={styles.patchLabel}>{ts('diff.patchSummary')}</span>
          {file.patch}
        </pre>
      )}

      {hasRenderableDiff && (
        <div className={styles.columnsShell} style={{ height: bodyHeight }}>
          {isMarkdown && markdownViewMode === 'preview' ? (
            <div className={styles.columns}>
              <DiffMarkdownPreviewColumn
                label={ts('diff.before')}
                content={before}
                emptyLabel={emptyLabel}
                scrollRef={beforeRef}
                onScroll={(scrollTop) => mirrorScroll('before', scrollTop)}
              />
              <DiffMarkdownPreviewColumn
                label={ts('diff.after')}
                content={after}
                emptyLabel={emptyLabel}
                scrollRef={afterRef}
                onScroll={(scrollTop) => mirrorScroll('after', scrollTop)}
              />
            </div>
          ) : (
            <Suspense fallback={<div className={styles.monacoDiffLoading}>{ts('editor.loading')}</div>}>
              <DiffMonacoSideBySide
                filePath={file.path}
                before={before}
                after={after}
                theme={syntaxTheme}
                rows={rows}
                changeSites={changeSites}
                activeChangeIndex={activeChangeIndex}
                beforeLabel={ts('diff.before')}
                afterLabel={ts('diff.after')}
              />
            </Suspense>
          )}
          <PanelResizeHandle
            edge="south"
            onDelta={onBodyHeightDelta}
            value={bodyHeight}
            min={MIN_DIFF_BODY_HEIGHT}
            max={maxDiffBodyHeight(typeof window === 'undefined' ? 800 : window.innerHeight)}
            ariaLabel={ts('resize.diffView')}
          />
        </div>
      )}
    </div>
  )
}
