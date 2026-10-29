import { useEffect } from 'react'
import type { AgentActivity } from '@contracts/index'
import { useWorkbenchStore } from '../../state/workbenchStore'
import { useI18n } from '../../i18n'
import RestrictedMarkdown from '../ChatPanel/RestrictedMarkdown'
import styles from './AgentActivityDetails.module.css'

interface Props {
  activities: AgentActivity[]
  selectedId: string | null
}

export default function AgentActivityDetails({ activities, selectedId }: Props) {
  const { ts } = useI18n()
  const openDiff = useWorkbenchStore((s) => s.navigateToDiffReviewFile)

  useEffect(() => {
    if (!selectedId) return
    const node = document.querySelector(`[data-activity-detail="${CSS.escape(selectedId)}"]`)
    node?.scrollIntoView({ block: 'nearest' })
  }, [selectedId, activities])

  if (activities.length === 0) return null

  return (
    <div className={styles.list}>
      {activities.map((activity) => (
        <article
          key={activity.id}
          className={`${styles.card} ${activity.id === selectedId ? styles.selected : ''}`}
          data-activity-detail={activity.id}
        >
          <h3>{activity.summary}</h3>
          <DetailBody activity={activity} ts={ts} onOpenDiff={openDiff} />
        </article>
      ))}
    </div>
  )
}

function DetailBody({
  activity,
  ts,
  onOpenDiff,
}: {
  activity: AgentActivity
  ts: (path: string, params?: Record<string, string | number>) => string
  onOpenDiff: (path?: string) => void
}) {
  const detail = activity.detail
  switch (detail.kind) {
    case 'thinking':
      if (!detail.content) {
        return <p className={styles.meta}>{ts('agentFlow.activity.thinkingPending')}</p>
      }
      return (
        <>
          {detail.truncated ? (
            <p className={styles.meta}>{ts('agentFlow.askReasoningTruncated')}</p>
          ) : null}
          <RestrictedMarkdown>{detail.content}</RestrictedMarkdown>
        </>
      )
    case 'planning':
      return (
        <>
          {detail.objective ? <p>{detail.objective}</p> : null}
          {detail.anchors.length > 0 ? (
            <ul>
              {detail.anchors.map((anchor) => <li key={anchor}>{anchor}</li>)}
            </ul>
          ) : null}
          {(detail.acceptanceCriteria?.length ?? 0) > 0 ? (
            <ol>
              {detail.acceptanceCriteria!.map((item) => <li key={item}>{item}</li>)}
            </ol>
          ) : null}
        </>
      )
    case 'grep':
      return (
        <>
          {detail.queries.length > 0 ? (
            <p className={styles.meta}>{detail.queries.join(', ')}</p>
          ) : null}
          <ul className={styles.hits}>
            {detail.hits.map((hit) => (
              <li key={`${hit.path}:${hit.line ?? ''}:${hit.preview ?? ''}`}>
                <code>{hit.path}{hit.line ? `:${hit.line}` : ''}</code>
                {hit.preview ? <pre>{hit.preview}</pre> : null}
              </li>
            ))}
          </ul>
          {detail.paths.filter((path) => !detail.hits.some((hit) => hit.path === path)).length > 0 ? (
            <ul>
              {detail.paths
                .filter((path) => !detail.hits.some((hit) => hit.path === path))
                .map((path) => <li key={path}><code>{path}</code></li>)}
            </ul>
          ) : null}
        </>
      )
    case 'read_file':
      return (
        <>
          <p>
            <code>{detail.path}</code>
            {detail.startLine && detail.endLine
              ? <span className={styles.meta}> · L{detail.startLine}–{detail.endLine}</span>
              : null}
          </p>
          {detail.status ? <p className={styles.meta}>{detail.status}</p> : null}
          {detail.truncated ? <p className={styles.meta}>{ts('agentFlow.activity.outputTruncated')}</p> : null}
          {detail.excerpt ? <pre>{detail.excerpt}</pre> : null}
        </>
      )
    case 'edit':
      return (
        <>
          <p><code>{detail.operation}</code> · <code>{detail.path}</code></p>
          {detail.additions !== undefined || detail.deletions !== undefined ? (
            <p className={styles.meta}>
              {ts('agentFlow.activity.hunkStats', {
                additions: detail.additions ?? 0,
                deletions: detail.deletions ?? 0,
              })}
            </p>
          ) : null}
          {detail.hunkHeader ? <pre>{detail.hunkHeader}</pre> : null}
          <button type="button" className={styles.link} onClick={() => onOpenDiff(detail.path)}>
            {ts('agentFlow.activity.openDiff')}
          </button>
        </>
      )
    case 'shell':
      return (
        <>
          {detail.command ? <pre>{detail.command}</pre> : null}
          <p className={styles.meta}>
            {detail.status}
            {detail.exitCode !== undefined && detail.exitCode !== null ? ` · exit ${detail.exitCode}` : ''}
            {detail.durationMs !== undefined ? ` · ${detail.durationMs} ms` : ''}
          </p>
          {detail.truncated ? <p className={styles.meta}>{ts('agentFlow.activity.outputTruncated')}</p> : null}
          {detail.stdout ? <pre>{detail.stdout}</pre> : null}
          {detail.stderr ? <pre>{detail.stderr}</pre> : null}
        </>
      )
    case 'context':
      return (
        <>
          {detail.bundleHash ? <code className={styles.hash}>{detail.bundleHash}</code> : null}
          <ul>
            {detail.files.map((file) => (
              <li key={file.path}>
                <code>{file.path}</code>
                <span className={styles.meta}>
                  {file.disposition}
                  {file.includedByteLength !== undefined || file.byteLength !== undefined
                    ? ` · ${file.includedByteLength ?? 0}/${file.byteLength ?? 0}`
                    : ''}
                  {file.omissionReason ? ` · ${file.omissionReason}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </>
      )
    case 'mcp':
      return (
        <p className={styles.meta}>
          {detail.serverId} · {detail.toolName} · {detail.status} · {detail.durationMs} ms
          {detail.error ? ` · ${detail.error}` : ''}
        </p>
      )
    default:
      return null
  }
}
