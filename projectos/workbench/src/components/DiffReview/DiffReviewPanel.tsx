import { useEffect, useMemo, useState } from 'react'
import type {
  ApplyResult,
  GeneratedDiff,
  VerificationCommandApprovalStatus,
  VerificationRunResult,
} from '@contracts/index'
import { useI18n } from '../../i18n'
import { useWorkbenchStore } from '../../state/workbenchStore'
import type { MarkdownDiffViewMode } from '../Markdown/markdownPath'
import Button from '../ui/Button'
import { computeDiffFileStat } from '../PendingChangesDrawer/diffFileStats'
import { splitFilePath } from '../../utils/filePathDisplay'
import { resolveFileTypeIcon } from '../../utils/fileTypeIcon'
import DiffFileView from './DiffFileView'
import {
  clampDiffBodyHeight,
  DEFAULT_DIFF_BODY_HEIGHT,
} from './diffViewLayout'
import styles from './DiffReviewPanel.module.css'

interface Props {
  diff: GeneratedDiff
  applyResult: ApplyResult | null
  verificationResult: VerificationRunResult | null
  verificationCommandApproval: VerificationCommandApprovalStatus | null
  verificationLoading: boolean
  undoLoading: boolean
  onApply: () => void
  onVerify: () => void
  onApproveVerification: () => void
  onUndo: () => void
}

export default function DiffReviewPanel({
  diff,
  applyResult,
  verificationResult,
  verificationCommandApproval,
  verificationLoading,
  undoLoading,
  onApply,
  onVerify,
  onApproveVerification,
  onUndo,
}: Props) {
  const { ts } = useI18n()
  const selectedDiffFilePath = useWorkbenchStore((s) => s.selectedDiffFilePath)
  const clearSelectedDiffFilePath = useWorkbenchStore((s) => s.clearSelectedDiffFilePath)
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {}
    diff.files.forEach((f) => {
      init[f.path] = f.path === selectedDiffFilePath
    })
    return init
  })
  const [bodyHeights, setBodyHeights] = useState<Record<string, number>>({})
  const [markdownDiffViewModes, setMarkdownDiffViewModes] = useState<
    Record<string, MarkdownDiffViewMode>
  >({})

  useEffect(() => {
    if (!selectedDiffFilePath) return
    setExpanded((current) => ({ ...current, [selectedDiffFilePath]: true }))
    clearSelectedDiffFilePath()
  }, [selectedDiffFilePath, clearSelectedDiffFilePath])

  const fileStatsByPath = useMemo(() => {
    const stats: Record<string, ReturnType<typeof computeDiffFileStat>> = {}
    for (const file of diff.files) {
      stats[file.path] = computeDiffFileStat(file)
    }
    return stats
  }, [diff.files])

  const toggle = (path: string) =>
    setExpanded((e) => ({ ...e, [path]: !e[path] }))

  const adjustBodyHeight = (path: string, delta: number) => {
    setBodyHeights((prev) => {
      const current = prev[path] ?? DEFAULT_DIFF_BODY_HEIGHT
      return { ...prev, [path]: clampDiffBodyHeight(current + delta) }
    })
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div>
          <h2>{ts('diff.title')}</h2>
          <p className={styles.summary}>{diff.summary}</p>
        </div>
        <div className={styles.headerActions}>
          {!applyResult?.applied && (
            <>
              <span className={styles.changeCount}>
                {ts('diff.willChange', { count: diff.files.length })}
              </span>
              <Button onClick={onApply}>{ts('common.apply')}</Button>
            </>
          )}
          {applyResult?.applied && (
            <>
              <span className={styles.appliedBadge}>
                {ts('diff.appliedFiles', { count: applyResult.filesChanged.length })}
              </span>
              {applyResult.verificationStatus !== 'demo_passed' && (
                <Button onClick={onVerify} disabled={verificationLoading}>
                  {verificationLoading ? ts('diff.verifying') : ts('diff.runVerification')}
                </Button>
              )}
              {applyResult.backupId && (
                <Button onClick={onUndo} disabled={undoLoading}>
                  {undoLoading ? ts('diff.undoing') : ts('diff.undo')}
                </Button>
              )}
              {verificationResult && (
                <span className={`${styles.verificationBadge} ${styles[`verification_${verificationResult.status}`]}`}>
                  {ts(`diff.verification_${verificationResult.status}` as 'diff.verification_passed')}
                </span>
              )}
              {verificationCommandApproval?.status === 'approval_required' && (
                <div className={styles.verificationApproval} role="alert">
                  <strong>{ts('diff.verificationApprovalTitle')}</strong>
                  <span>{ts('diff.verificationApprovalBody')}</span>
                  <div className={styles.verificationCommands}>
                    {verificationCommandApproval.commands.map((command, index) => (
                      <code key={`${verificationCommandApproval.commandSetHash}:${index}`}>
                        {JSON.stringify(command)}
                      </code>
                    ))}
                  </div>
                  <Button onClick={onApproveVerification} disabled={verificationLoading}>
                    {verificationLoading
                      ? ts('diff.verifying')
                      : ts('diff.approveAndRunVerification')}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
      <div className={styles.files}>
        {diff.files.map((file) => {
          const stats = fileStatsByPath[file.path]
          const Icon = resolveFileTypeIcon(file.path)
          const { basename, dirname } = splitFilePath(file.path)
          return (
          <div key={file.path} className={styles.fileBlock}>
            <button type="button" className={styles.fileHeader} onClick={() => toggle(file.path)}>
              <span className={styles.chevron}>{expanded[file.path] ? '▾' : '▸'}</span>
              <Icon className={styles.fileIcon} size={14} strokeWidth={1.75} aria-hidden />
              <span className={styles.fileMeta}>
                <span className={styles.fileBasename}>{basename}</span>
                {dirname ? <span className={styles.fileDirname}>{dirname}</span> : null}
              </span>
              {stats ? (
                <span className={styles.fileStats}>
                  {stats.added > 0 ? (
                    <span className={styles.statsAdded}>+{stats.added}</span>
                  ) : null}
                  {stats.added > 0 && stats.removed > 0 ? ' ' : null}
                  {stats.removed > 0 ? (
                    <span className={styles.statsRemoved}>-{stats.removed}</span>
                  ) : null}
                </span>
              ) : null}
            </button>
            {expanded[file.path] && (
              <DiffFileView
                file={file}
                bodyHeight={bodyHeights[file.path] ?? DEFAULT_DIFF_BODY_HEIGHT}
                onBodyHeightDelta={(delta) => adjustBodyHeight(file.path, delta)}
                markdownViewMode={markdownDiffViewModes[file.path] ?? 'text'}
                onMarkdownViewModeChange={(mode) =>
                  setMarkdownDiffViewModes((prev) => ({ ...prev, [file.path]: mode }))
                }
              />
            )}
          </div>
          )
        })}
      </div>
    </div>
  )
}
