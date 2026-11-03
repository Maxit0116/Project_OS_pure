import type { TraceSpanView } from '@contracts/index'
import { useI18n } from '../../../i18n'
import styles from './AgentPoolSpanInspector.module.css'

interface Props {
  span: TraceSpanView
  majorActionName?: string | null
}

function formatDuration(startMs: number, endMs?: number): string {
  if (endMs == null) return '—'
  const ms = Math.max(0, endMs - startMs)
  if (ms < 1000) return `${Math.round(ms)}ms`
  const seconds = ms / 1000
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`
  const minutes = Math.floor(seconds / 60)
  const rem = Math.round(seconds % 60)
  return `${minutes}m ${rem}s`
}

export default function AgentPoolSpanInspector({ span, majorActionName }: Props) {
  const { ts } = useI18n()
  const attrs = span.attributes
  const files = Array.isArray(attrs.files)
    ? (attrs.files as Array<{ path?: string }>)
        .map((file) => file.path)
        .filter(Boolean)
    : typeof attrs.path === 'string'
      ? [attrs.path]
      : Array.isArray(attrs.filesWritten)
        ? (attrs.filesWritten as string[])
        : []

  return (
    <div className={styles.inspector} aria-label={ts('agentFlow.pool.inspectorTitle')}>
      <header className={styles.header}>
        <h4 className={styles.title}>{span.name}</h4>
        <span className={styles.badge} data-status={span.status}>
          {span.status}
        </span>
      </header>
      <dl className={styles.grid}>
        <div>
          <dt>{ts('agentFlow.pool.inspectorKind')}</dt>
          <dd>{span.kind}</dd>
        </div>
        <div>
          <dt>{ts('agentFlow.pool.inspectorDuration')}</dt>
          <dd>{formatDuration(span.startMs, span.endMs)}</dd>
        </div>
        <div>
          <dt>{ts('agentFlow.pool.inspectorTiming')}</dt>
          <dd>{span.timingQuality}</dd>
        </div>
        {majorActionName ? (
          <div>
            <dt>{ts('agentFlow.pool.inspectorParent')}</dt>
            <dd>{majorActionName}</dd>
          </div>
        ) : null}
        {typeof attrs.model === 'string' ? (
          <div>
            <dt>{ts('agentFlow.pool.inspectorModel')}</dt>
            <dd>
              {String(attrs.provider ?? '')}
              {attrs.provider ? ' · ' : ''}
              {attrs.model}
            </dd>
          </div>
        ) : null}
        {typeof attrs.toolName === 'string' ? (
          <div>
            <dt>{ts('agentFlow.pool.inspectorTool')}</dt>
            <dd>
              {String(attrs.serverId ?? '')}
              {attrs.serverId ? ' · ' : ''}
              {attrs.toolName}
            </dd>
          </div>
        ) : null}
        {attrs.tokenUsage &&
        typeof attrs.tokenUsage === 'object' &&
        attrs.usage === 'reported' ? (
          <div>
            <dt>{ts('agentFlow.pool.inspectorTokens')}</dt>
            <dd>
              {(attrs.tokenUsage as { input: number; output: number }).input}/
              {(attrs.tokenUsage as { input: number; output: number }).output}
            </dd>
          </div>
        ) : null}
        {typeof attrs.summary === 'string' ? (
          <div className={styles.wide}>
            <dt>{ts('agentFlow.pool.inspectorSummary')}</dt>
            <dd>{attrs.summary}</dd>
          </div>
        ) : null}
        {typeof attrs.error === 'string' ? (
          <div className={styles.wide}>
            <dt>{ts('agentFlow.pool.inspectorError')}</dt>
            <dd data-tone="error">{attrs.error}</dd>
          </div>
        ) : null}
        {files.length > 0 ? (
          <div className={styles.wide}>
            <dt>{ts('agentFlow.pool.inspectorFiles')}</dt>
            <dd>
              <ul className={styles.files}>
                {files.map((path) => (
                  <li key={path}>{path}</li>
                ))}
              </ul>
            </dd>
          </div>
        ) : null}
      </dl>
    </div>
  )
}
