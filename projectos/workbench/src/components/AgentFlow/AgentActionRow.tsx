import type { AgentActionEvent } from '@contracts/index'
import { useI18n } from '../../i18n'
import styles from './AgentActionRow.module.css'

export function agentActionMetadata(event: AgentActionEvent): string[] {
  switch (event.type) {
    case 'context_assembled':
      return [
        ...(event.payload.childrenCoverage
          ? [`children · ${event.payload.childrenCoverage.includedCount} included / ${event.payload.childrenCoverage.omittedCount} omitted`]
          : []),
        ...event.payload.files.map((file) =>
          `${file.path} · ${file.disposition} · ${file.includedByteLength ?? 0}/${file.byteLength ?? 0} bytes`,
        ),
      ]
    case 'context_attached':
      return [
        ...event.payload.autoFiles.map((file) => `auto · ${file.path} · ${file.disposition}`),
        ...event.payload.explicitAttachments.map(
          (attachment) =>
            `explicit · ${attachment.label} · ${attachment.kind} · ${attachment.disposition}`,
        ),
        ...(event.payload.invokedSkillId ? [`skill · ${event.payload.invokedSkillId}`] : []),
      ]
    case 'file_read':
      return [`${event.payload.path} · ${event.payload.byteLength} bytes · ${event.payload.status}`]
    case 'model_request':
      return [
        `${event.payload.provider} · ${event.payload.model} · ${event.payload.durationMs} ms`,
        `${event.payload.tokenUsage.input} in / ${event.payload.tokenUsage.output} out · ${event.payload.status}`,
      ]
    case 'mcp_tool_call':
      return [
        `${event.payload.serverId} · ${event.payload.toolName}`,
        `${event.payload.status} · ${event.payload.durationMs} ms`,
      ]
    case 'edit_plan_created':
      return [
        `objective · ${event.payload.objective}`,
        ...event.payload.anchors.map((anchor) => `anchor · ${anchor}`),
        ...event.payload.acceptanceCriteria.map((criterion) => `acceptance · ${criterion}`),
        `rationale · ${event.payload.rationale}`,
      ]
    case 'proposal_validation_result':
      return [
        `validated · ${event.payload.path}`,
        `verdict · ${event.payload.verdict}`,
        ...event.payload.criteria.map((criterion) =>
          `${criterion.status} · ${criterion.criterion}`),
        `scope · ${event.payload.scopeStatus}`,
        `summary · ${event.payload.summary}`,
        `rationale · ${event.payload.rationale}`,
      ]
    case 'batch_validation_result':
      return [
        `plan · ${event.payload.planId}`,
        `verdict · ${event.payload.verdict}`,
        ...event.payload.tasks.flatMap((task) => [
          `${task.status} · ${task.path}`,
          ...task.criteria.map((criterion) =>
            `${criterion.status} · ${criterion.criterion}`),
        ]),
        `cross-file · ${event.payload.crossFileStatus}`,
        `summary · ${event.payload.summary}`,
        `rationale · ${event.payload.rationale}`,
      ]
    case 'decision_summary':
      return [event.payload.summary]
    case 'diff_proposed':
      return event.payload.files.map((file) => `${file.operation} · ${file.path}`)
    case 'apply_result':
      return [
        ...event.payload.filesWritten.map((path) => `write · ${path}`),
        ...(event.payload.backupId ? [`backup · ${event.payload.backupId}`] : []),
        event.payload.outcome,
      ]
    case 'verification_result':
      return [event.payload.command ?? '—', event.payload.status]
    case 'initialization_tranche_progress':
      return [
        `tranche ${event.payload.order}/${event.payload.totalTranches} · ${event.payload.status}`,
        `created · ${event.payload.nodesCreated} nodes / ${event.payload.filesCreated} files`,
        `committed checkpoints · ${event.payload.committedTrancheIds.length}`,
        ...(event.payload.backupId ? [`backup · ${event.payload.backupId}`] : []),
        ...(event.payload.reason ? [`reason · ${event.payload.reason}`] : []),
      ]
    default:
      return []
  }
}

function localizedAgentActionMetadata(
  event: AgentActionEvent,
  ts: (path: string, params?: Record<string, string | number>) => string,
): string[] {
  switch (event.type) {
    case 'context_assembled':
      return [
        ...(event.payload.childrenCoverage
          ? [ts('agentFlow.actionMeta.childNodes', {
              included: event.payload.childrenCoverage.includedCount,
              omitted: event.payload.childrenCoverage.omittedCount,
              total: event.payload.childrenCoverage.totalCount,
            })]
          : []),
        ...event.payload.files.map((file) => ts('agentFlow.actionMeta.contextFile', {
          path: file.path,
          disposition: file.disposition,
          included: file.includedByteLength ?? 0,
          total: file.byteLength ?? 0,
        })),
      ]
    case 'file_read':
      return [ts('agentFlow.actionMeta.fileRead', {
        path: event.payload.path,
        bytes: event.payload.byteLength,
        status: event.payload.status,
      })]
    case 'model_request':
      return [
        ts('agentFlow.actionMeta.model', {
          provider: event.payload.provider,
          model: event.payload.model,
          duration: event.payload.durationMs,
        }),
        ts('agentFlow.actionMeta.tokens', {
          input: event.payload.tokenUsage.input,
          output: event.payload.tokenUsage.output,
          status: event.payload.status,
        }),
      ]
    case 'mcp_tool_call':
      return [
        ts('agentFlow.actionMeta.mcpTool', {
          server: event.payload.serverId,
          tool: event.payload.toolName,
        }),
        ts('agentFlow.actionMeta.mcpStatus', {
          status: event.payload.status,
          duration: event.payload.durationMs,
        }),
        ...(event.payload.error
          ? [ts('agentFlow.actionMeta.mcpError', { error: event.payload.error })]
          : []),
      ]
    case 'edit_plan_created':
      return [
        ts('agentFlow.actionMeta.planPath', { path: event.payload.path }),
        ts('agentFlow.actionMeta.planObjective', { objective: event.payload.objective }),
        ...event.payload.anchors.map((anchor) =>
          ts('agentFlow.actionMeta.planAnchor', { anchor })),
        ...event.payload.acceptanceCriteria.map((criterion) =>
          ts('agentFlow.actionMeta.planAcceptance', { criterion })),
        ts('agentFlow.actionMeta.planRationale', { rationale: event.payload.rationale }),
      ]
    case 'proposal_validation_result':
      return [
        ts('agentFlow.actionMeta.validationPath', { path: event.payload.path }),
        ts('agentFlow.actionMeta.validationVerdict', { verdict: event.payload.verdict }),
        ...event.payload.criteria.map((criterion) =>
          ts('agentFlow.actionMeta.validationCriterion', {
            status: criterion.status,
            criterion: criterion.criterion,
          })),
        ts('agentFlow.actionMeta.validationScope', { status: event.payload.scopeStatus }),
        ts('agentFlow.actionMeta.validationSummary', { summary: event.payload.summary }),
        ts('agentFlow.actionMeta.validationRationale', { rationale: event.payload.rationale }),
      ]
    case 'batch_validation_result':
      return [
        ts('agentFlow.actionMeta.batchPlan', { id: event.payload.planId }),
        ts('agentFlow.actionMeta.validationVerdict', { verdict: event.payload.verdict }),
        ...event.payload.tasks.flatMap((task) => [
          ts('agentFlow.actionMeta.batchTask', {
            path: task.path,
            status: task.status,
          }),
          ...task.criteria.map((criterion) =>
            ts('agentFlow.actionMeta.validationCriterion', {
              status: criterion.status,
              criterion: criterion.criterion,
            })),
        ]),
        ts('agentFlow.actionMeta.batchCrossFile', {
          status: event.payload.crossFileStatus,
        }),
        ts('agentFlow.actionMeta.validationSummary', { summary: event.payload.summary }),
        ts('agentFlow.actionMeta.validationRationale', { rationale: event.payload.rationale }),
      ]
    case 'decision_summary':
      return [event.payload.summary]
    case 'diff_proposed':
      return event.payload.files.map((file) => ts('agentFlow.actionMeta.diffFile', {
        operation: file.operation,
        path: file.path,
      }))
    case 'apply_result':
      return [
        ...event.payload.filesWritten.map((path) => ts('agentFlow.actionMeta.fileWritten', { path })),
        ...(event.payload.backupId
          ? [ts('agentFlow.actionMeta.backup', { id: event.payload.backupId })]
          : []),
        ts('agentFlow.actionMeta.outcome', { outcome: event.payload.outcome }),
      ]
    case 'verification_result':
      return [
        ts('agentFlow.actionMeta.command', { command: event.payload.command ?? '—' }),
        ts('agentFlow.actionMeta.status', { status: event.payload.status }),
      ]
    case 'initialization_tranche_progress':
      return [
        ts('agentFlow.actionMeta.initializationTranche', {
          order: event.payload.order,
          total: event.payload.totalTranches,
          status: event.payload.status,
        }),
        ts('agentFlow.actionMeta.initializationCreated', {
          nodes: event.payload.nodesCreated,
          files: event.payload.filesCreated,
        }),
        ts('agentFlow.actionMeta.initializationCommitted', {
          count: event.payload.committedTrancheIds.length,
        }),
        ...(event.payload.backupId
          ? [ts('agentFlow.actionMeta.backup', { id: event.payload.backupId })]
          : []),
        ...(event.payload.reason
          ? [ts('agentFlow.actionMeta.initializationReason', { reason: event.payload.reason })]
          : []),
      ]
    default:
      return []
  }
}

export default function AgentActionRow({ event }: { event: AgentActionEvent }) {
  const { ts } = useI18n()
  const title = ts(`agentFlow.actions.${event.type}` as 'agentFlow.actions.context_assembled')

  return (
    <div className={styles.card} data-action={event.type}>
      <div className={styles.heading}>
        <span>{title}</span>
        <time>{new Date(event.timestamp).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time>
      </div>
      {event.type === 'context_assembled' && (
        <div className={styles.meta}>
          {ts('agentFlow.actionBundle', {
            count: event.payload.files.length,
            synopsis: event.payload.synopsisPresent
              ? ts('agentFlow.synopsisIncluded')
              : ts('agentFlow.synopsisMissing'),
          })}
          <code>{event.payload.bundleHash}</code>
        </div>
      )}
      {event.type === 'context_attached' && (
        <div className={styles.meta}>
          {ts('agentFlow.actionBundle', {
            count: event.payload.autoFiles.length,
            synopsis: ts('agentFlow.synopsisIncluded'),
          })}
          {event.payload.explicitAttachments.length > 0
            ? ` · ${event.payload.explicitAttachments.length} explicit`
            : ''}
          <code>{event.payload.bundleHash}</code>
        </div>
      )}
      <ul>
        {localizedAgentActionMetadata(event, ts).map((line, index) => <li key={`${line}-${index}`}>{line}</li>)}
      </ul>
    </div>
  )
}
