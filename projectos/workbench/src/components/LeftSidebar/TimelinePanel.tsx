import { useEffect } from 'react'
import { Bot, GitCompare, History, RotateCcw, Save } from 'lucide-react'
import type { FileTimelineEntry, FileTimelineEntryKind } from '@contracts/index'
import { useI18n } from '../../i18n'
import { useFileTimelineStore } from '../../state/fileTimelineStore'
import styles from './TimelinePanel.module.css'

interface Props {
  filePath: string | null
}

const KIND_ICON: Record<FileTimelineEntryKind, typeof History> = {
  agent_proposed: Bot,
  agent_applied: Bot,
  agent_reverted: RotateCcw,
  manual_save: Save,
}

function formatRelativeTime(timestamp: string): string {
  const deltaMs = Date.now() - new Date(timestamp).getTime()
  const minutes = Math.max(1, Math.round(deltaMs / 60_000))
  if (minutes < 60) return `${minutes}m`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `${hours}h`
  return new Date(timestamp).toLocaleDateString()
}

function kindLabel(
  kind: FileTimelineEntryKind,
  ts: (key: string) => string,
): string {
  switch (kind) {
    case 'agent_proposed':
      return ts('timeline.agentProposed')
    case 'agent_applied':
      return ts('timeline.agentApplied')
    case 'agent_reverted':
      return ts('timeline.agentReverted')
    case 'manual_save':
      return ts('timeline.manualSave')
    default:
      return kind
  }
}

function TimelineRow({ entry }: { entry: FileTimelineEntry }) {
  const { ts } = useI18n()
  const compareEntry = useFileTimelineStore((s) => s.compareEntry)
  const restoreEntry = useFileTimelineStore((s) => s.restoreEntry)
  const Icon = KIND_ICON[entry.kind]

  return (
    <div className={styles.row}>
      <div className={styles.rowMain}>
        <Icon size={12} strokeWidth={1.75} className={styles.icon} aria-hidden />
        <div className={styles.meta}>
          <span className={styles.label}>{kindLabel(entry.kind, ts)}</span>
          <span className={styles.time}>{formatRelativeTime(entry.timestamp)}</span>
        </div>
      </div>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.actionBtn}
          onClick={() => void compareEntry(entry)}
          aria-label={ts('timeline.compare')}
          title={ts('timeline.compare')}
        >
          <GitCompare size={12} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          className={styles.actionBtn}
          onClick={() => void restoreEntry(entry)}
          aria-label={ts('timeline.restore')}
          title={ts('timeline.restore')}
        >
          <RotateCcw size={12} strokeWidth={1.75} />
        </button>
      </div>
    </div>
  )
}

export default function TimelinePanel({ filePath }: Props) {
  const { ts } = useI18n()
  const entriesByFile = useFileTimelineStore((s) => s.entriesByFile)
  const loadingFiles = useFileTimelineStore((s) => s.loadingFiles)
  const loadForFile = useFileTimelineStore((s) => s.loadForFile)

  useEffect(() => {
    if (!filePath) return
    void loadForFile(filePath)
  }, [filePath, loadForFile])

  const entries = filePath ? entriesByFile[filePath] ?? [] : []
  const loading = filePath ? loadingFiles[filePath] : false

  if (!filePath) {
    return <p className={styles.empty}>{ts('timeline.noFile')}</p>
  }

  if (loading && entries.length === 0) {
    return <p className={styles.empty}>{ts('timeline.loading')}</p>
  }

  if (entries.length === 0) {
    return <p className={styles.empty}>{ts('timeline.empty')}</p>
  }

  return (
    <div className={styles.panel}>
      {entries.map((entry) => (
        <TimelineRow key={entry.id} entry={entry} />
      ))}
    </div>
  )
}
