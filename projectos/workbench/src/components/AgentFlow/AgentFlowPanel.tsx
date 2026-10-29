import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import type {
  AgentActionEvent,
  AgentDelegationEvent,
  AgentFlowStep,
  AgentRunRole,
  AgentRunScope,
  AgentRunEvent,
  AgentTransientTrace,
  ApplyResult,
  VerificationRunResult,
} from '@contracts/index'
import { useBottomDockStore } from '../../state/bottomDockStore'
import { useActivityStore } from '../../state/activityStore'
import { useWorkbenchStore } from '../../state/workbenchStore'
import { useI18n } from '../../i18n'
import AgentFlowStepRow from './AgentFlowStepRow'
import AgentFlowCorrectionRow from './AgentFlowCorrectionRow'
import AgentFlowGraph from './AgentFlowGraph'
import AgentFlowStepDetail from './AgentFlowStepDetail'
import AgentActionRow from './AgentActionRow'
import AskTraceView from './AskTraceView'
import PlanTraceView from './PlanTraceView'
import AgentActivityDetails from './AgentActivityDetails'
import { AgentPoolPanel } from './AgentPool'
import { buildActivityLabels, projectAgentActivities } from './projectAgentActivities'
import RestrictedMarkdown from '../ChatPanel/RestrictedMarkdown'
import TabBar from '../ui/TabBar'
import Button from '../ui/Button'
import EmptyState from '../ui/EmptyState'
import AgentActivityIndicator from '../ui/AgentActivityIndicator'
import { Workflow } from 'lucide-react'
import styles from './AgentFlowPanel.module.css'

interface Props {
  steps: AgentFlowStep[]
  status: string
  diffReady: boolean
  onReviewDiff: () => void
}

export default function AgentFlowPanel({ steps, status, diffReady, onReviewDiff }: Props) {
  const agentFlowViewMode = useWorkbenchStore((s) => s.agentFlowViewMode)
  const setAgentFlowViewMode = useWorkbenchStore((s) => s.setAgentFlowViewMode)
  const selectedFlowStepId = useWorkbenchStore((s) => s.selectedFlowStepId)
  const setSelectedFlowStepId = useWorkbenchStore((s) => s.setSelectedFlowStepId)
  const flowCorrections = useWorkbenchStore((s) => s.flowCorrections)
  const flowActions = useWorkbenchStore((s) => s.flowActions)
  const flowTransientTraces = useWorkbenchStore((s) => s.flowTransientTraces)
  const flowDelegationEvents = useWorkbenchStore((s) => s.flowDelegationEvents)
  const delegatedRunTraces = useWorkbenchStore((s) => s.delegatedRunTraces)
  const applyResult = useWorkbenchStore((s) => s.applyResult)
  const verificationResult = useWorkbenchStore((s) => s.verificationResult)
  const undoLoading = useWorkbenchStore((s) => s.undoLoading)
  const undoCurrentApply = useWorkbenchStore((s) => s.undoCurrentApply)
  const applyCurrentDiff = useWorkbenchStore((s) => s.applyCurrentDiff)
  const agentFlowSubject = useWorkbenchStore((s) => s.agentFlowSubject)
  const latestAskTrace = useWorkbenchStore((s) => s.latestAskTrace)
  const latestPlanTrace = useWorkbenchStore((s) => s.latestPlanTrace)
  const messages = useWorkbenchStore((s) => s.messages)
  const chatMode = useWorkbenchStore((s) => s.chatMode)
  const activeRunId = useWorkbenchStore((s) => s.activeRunId)
  const selectedActivityId = useWorkbenchStore((s) => s.selectedActivityId)
  const debugSession = useWorkbenchStore((s) => s.debugSession)
  const stopAgentRun = useWorkbenchStore((s) => s.stopAgentRun)
  const refineLoading = useWorkbenchStore((s) => s.refineLoading)
  const { ts } = useI18n()
  const activities = useMemo(() => projectAgentActivities({
    messages,
    latestAskTrace,
    latestPlanTrace,
    activeRunId,
    flowActions,
      flowTransientTraces,
      chatMode,
      debugExploration: debugSession?.explorationTrace ?? null,
    }, buildActivityLabels(ts)), [
    messages,
    latestAskTrace,
    latestPlanTrace,
    activeRunId,
    flowActions,
    flowTransientTraces,
    chatMode,
    debugSession,
    ts,
  ])
  const activityDetails = (
    <AgentActivityDetails
      activities={activities.filter((activity) => !activity.phaseId)}
      selectedId={selectedActivityId}
    />
  )
  const timelineRef = useRef<HTMLDivElement>(null)
  const prevStepCount = useRef(steps.length)

  useEffect(() => {
    if (steps.length > prevStepCount.current && timelineRef.current) {
      const last = timelineRef.current.querySelector('[data-step]:last-child')
      last?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
    prevStepCount.current = steps.length
  }, [steps.length])

  const viewTabs = [
    { id: 'timeline', label: ts('agentFlow.timeline') },
    { id: 'graph', label: ts('agentFlow.graph') },
    { id: 'pool', label: ts('agentFlow.pool.tab') },
  ]

  const renderShell = (statusLabel: ReactNode, body: ReactNode, footer?: ReactNode) => (
    <div className={styles.panel}>
      <div className={styles.header}>
        <h2>{ts('agentFlow.title')}</h2>
        <div className={styles.headerActions}>
          {typeof statusLabel === 'string' || typeof statusLabel === 'number' ? (
            <span className={styles.status}>{statusLabel}</span>
          ) : (
            statusLabel
          )}
        </div>
      </div>
      <TabBar
        tabs={viewTabs}
        activeId={agentFlowViewMode}
        onChange={(id) => setAgentFlowViewMode(id as 'timeline' | 'graph' | 'pool')}
        size="sm"
      />
      {body}
      {footer}
    </div>
  )

  // Pool is always reachable — even on empty / ask / plan / debug subjects.
  if (agentFlowViewMode === 'pool') {
    const poolStatus =
      agentFlowSubject === 'ask' && latestAskTrace
        ? ts(`agentFlow.status.${latestAskTrace.status}` as 'agentFlow.status.running')
        : agentFlowSubject === 'plan' && latestPlanTrace
          ? ts('plan.title')
          : agentFlowSubject === 'debug' && debugSession
            ? ts(`debug.phase.${debugSession.phase}` as 'debug.phase.align')
            : ts(`agentFlow.status.${status}` as 'agentFlow.status.running')
    return renderShell(poolStatus, <AgentPoolPanel />)
  }

  if (agentFlowSubject === 'ask' && latestAskTrace) {
    return renderShell(
      ts(`agentFlow.status.${latestAskTrace.status}` as 'agentFlow.status.running'),
      <>
        <AskTraceView trace={latestAskTrace} />
        {activityDetails}
      </>,
    )
  }

  if (agentFlowSubject === 'plan' && latestPlanTrace) {
    return renderShell(
      ts('plan.title'),
      <>
        <PlanTraceView trace={latestPlanTrace} />
        {activityDetails}
      </>,
    )
  }

  if (agentFlowSubject === 'debug' && debugSession) {
    return renderShell(
      ts(`debug.phase.${debugSession.phase}` as 'debug.phase.align'),
      <>
        <section className={styles.card}>
          <h3>{ts('debug.title')}</h3>
          <p>{debugSession.bugDescription}</p>
          <p>{ts('debug.hypotheses')}: {debugSession.hypotheses.length}</p>
          <p>{ts('debug.reproSteps')}: {debugSession.reproSteps.length}</p>
        </section>
        {activityDetails}
      </>,
    )
  }

  if (steps.length === 0 && status === 'idle' && activities.length === 0) {
    return renderShell(
      ts('agentFlow.status.idle'),
      <EmptyState
        icon={<Workflow size={16} />}
        title={ts('agentFlow.emptyTitle')}
        description={ts('agentFlow.emptyDesc')}
      />,
    )
  }

  const selectedStep = steps.find((s) => s.id === selectedFlowStepId)
  const stepCorrections = selectedStep
    ? flowCorrections.filter((c) => c.stepId === selectedStep.id)
    : []

  const phaseTimeline = groupAgentFlowPhaseTrace(steps, flowActions, flowTransientTraces)
  const timelineItems = phaseTimeline.flatMap(({ step, actions: phaseActions, traces: phaseTraces }, i) => {
    const items: ReactNode[] = [
      <AgentFlowStepRow
        key={step.id}
        step={step}
        isLast={i === steps.length - 1 && !flowCorrections.some((c) => c.stepId === step.id)}
        index={i}
        onSelect={() => setSelectedFlowStepId(step.id)}
        selected={selectedFlowStepId === step.id}
        hasCorrection={flowCorrections.some((c) => c.stepId === step.id)}
      />,
    ]
    const phaseActivities = activities.filter((activity) => activity.phaseId === step.id)
    if (phaseActions.length > 0 || phaseTraces.length > 0 || phaseActivities.length > 0) {
      items.push(
        <section
          key={`${step.id}_actions`}
          className={styles.phaseTrace}
          aria-label={`${step.label} · ${ts('agentFlow.actionTrace')}`}
        >
          {phaseActions.map((event) => (
            <AgentActionRow key={event.eventId} event={event} />
          ))}
          {phaseTraces.map((trace) => (
            <TransientReasoningTrace key={trace.traceId} trace={trace} />
          ))}
          {phaseActivities.length > 0 ? (
            <AgentActivityDetails activities={phaseActivities} selectedId={selectedActivityId} />
          ) : null}
        </section>,
      )
    }
    const corrections = flowCorrections.filter((c) => c.stepId === step.id)
    corrections.forEach((correction, ci) => {
      items.push(
        <AgentFlowCorrectionRow key={correction.id} correction={correction} index={i + ci + 1} />,
      )
    })
    return items
  })
  const unphasedActions = flowActions.filter((event) => !event.phaseId)
  const delegatedBatchAwaitingApply = status === 'awaiting_review' &&
    flowDelegationEvents.some((event) => event.type === 'task_delegated') &&
    flowActions.some((event) =>
      event.type === 'batch_validation_result' && event.payload.verdict === 'valid')

  const runStatus = (
    <>
      <span className={styles.status}>
        {ts(`agentFlow.status.${status}` as 'agentFlow.status.running')}
      </span>
      {status === 'running' || refineLoading ? (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => void stopAgentRun()}
        >
          {ts('chat.stop')}
        </Button>
      ) : null}
    </>
  )

  const runBody = (
    <>
      {applyResult?.applied && verificationResult && (
        <AutomaticApplySummary
          applyResult={applyResult}
          verificationResult={verificationResult}
          onReviewDiff={onReviewDiff}
        />
      )}
      {agentFlowViewMode === 'timeline' ? (
        <div className={styles.timeline} ref={timelineRef}>
          {activityDetails}
          {timelineItems}
          {flowDelegationEvents.length > 0 && (
            <DelegatedRunTree
              events={flowDelegationEvents}
              tracesByRun={delegatedRunTraces}
            />
          )}
          {unphasedActions.length > 0 && (
            <section className={styles.actionTrace} aria-label={ts('agentFlow.actionTrace')}>
              <h3>{ts('agentFlow.actionTrace')}</h3>
              {unphasedActions.map((event) => (
                <AgentActionRow key={event.eventId} event={event} />
              ))}
            </section>
          )}
          {status === 'running' && steps.length === 0 && (
            <AgentActivityIndicator
              className={styles.runningHint}
              state="composing"
              label={ts('agentFlow.waitingFirstStep')}
            />
          )}
          {status === 'running' && steps.length > 0 && (
            <AgentActivityIndicator
              className={styles.runningHint}
              state="working"
              label={ts('agentFlow.streaming')}
            />
          )}
        </div>
      ) : (
        <AgentFlowGraph steps={steps} status={status} onSelectStep={setSelectedFlowStepId} />
      )}
      {selectedStep && (
        <AgentFlowStepDetail
          step={selectedStep}
          corrections={stepCorrections}
          onClose={() => setSelectedFlowStepId(null)}
        />
      )}
    </>
  )

  const runFooter = (
    <>
      {diffReady && !applyResult?.applied && (
        <div className={styles.footer}>
          <Button className={styles.reviewBtnPulse} onClick={onReviewDiff}>
            {ts('agentFlow.reviewDiff')}
          </Button>
        </div>
      )}
      {delegatedBatchAwaitingApply && !applyResult && (
        <div className={styles.footer}>
          <Button onClick={() => void applyCurrentDiff()}>
            {ts('agentFlow.applyTransactionGroup')}
          </Button>
        </div>
      )}
      {applyResult?.backupId && applyResult.outcome === 'applied' && (
        <div className={styles.footer}>
          <Button onClick={() => void undoCurrentApply()} disabled={undoLoading}>
            {undoLoading ? ts('diff.undoing') : ts('agentFlow.undoTransactionGroup')}
          </Button>
        </div>
      )}
    </>
  )

  return renderShell(runStatus, runBody, runFooter)
}

export function AutomaticApplySummary({
  applyResult,
  verificationResult,
  onReviewDiff,
}: {
  applyResult: ApplyResult
  verificationResult: VerificationRunResult
  onReviewDiff: () => void
}) {
  const { ts } = useI18n()
  const openActivity = () => {
    useActivityStore.getState().setActiveChannel('verification')
    useBottomDockStore.getState().setActiveView('activity')
  }
  return (
    <section className={styles.automaticSummary} data-agent-flow="automatic-apply-summary">
      <strong>
        {ts('agentFlow.automaticApplySummary', {
          count: applyResult.filesChanged.length,
          status: verificationResult.status,
        })}
      </strong>
      <div className={styles.automaticSummaryActions}>
        <Button onClick={onReviewDiff}>{ts('agentFlow.reviewAppliedDiff')}</Button>
        <Button variant="secondary" onClick={openActivity}>
          {ts('activity.viewFullLog')}
        </Button>
      </div>
    </section>
  )
}

interface DelegatedTraceView {
  taskId: string
  filePath: string
  nodeId?: string
  parentRunId?: string
  rootRunId?: string
  targetKind?: 'planner' | 'leaf-file'
  scopeKind?: AgentRunScope['kind']
  role?: AgentRunRole
  events: AgentRunEvent[]
  transientTraces: AgentTransientTrace[]
}

export function DelegatedRunTree({
  events,
  tracesByRun,
}: {
  events: AgentDelegationEvent[]
  tracesByRun: Record<string, DelegatedTraceView>
}) {
  const { ts } = useI18n()
  const plan = events.find((event) => event.type === 'plan_created')?.payload.plan
  const delegated = events.filter(
    (event): event is Extract<AgentDelegationEvent, { type: 'task_delegated' }> =>
      event.type === 'task_delegated',
  )
  if (!plan) return null

  const rootRole = 'parentScope' in plan
    ? plannerRoleForScope(plan.parentScope.kind)
    : 'node_planner'

  return (
    <section
      className={styles.delegationTree}
      aria-label={ts('agentFlow.delegationTree')}
      role="tree"
      data-run-role={rootRole}
    >
      <header>
        <div className={styles.delegationPlanHeading}>
          <strong>{ts('agentFlow.delegationPlan')}</strong>
          <span className={styles.runRole}>{agentRoleLabel(ts, rootRole)}</span>
        </div>
        <span>{plan.objective}</span>
      </header>
      {delegated.length === 0 && (
        <p className={styles.emptyDelegation}>{ts('agentFlow.delegationEmpty')}</p>
      )}
      <div role="group" className={styles.delegatedChildren}>
        {delegated.map((event) => (
          <DelegatedRunNode
            key={event.payload.childRunId}
            event={event}
            parentEvents={events}
            tracesByRun={tracesByRun}
            depth={1}
            ancestorRunIds={new Set<string>()}
          />
        ))}
      </div>
    </section>
  )
}

function DelegatedRunNode({
  event,
  parentEvents,
  tracesByRun,
  depth,
  ancestorRunIds,
}: {
  event: Extract<AgentDelegationEvent, { type: 'task_delegated' }>
  parentEvents: AgentDelegationEvent[]
  tracesByRun: Record<string, DelegatedTraceView>
  depth: number
  ancestorRunIds: Set<string>
}) {
  const { ts } = useI18n()
  const runId = event.payload.childRunId
  const trace = tracesByRun[runId]
  const childEvents = trace?.events ?? []
  const childDelegationEvents = childEvents.filter(
    (candidate): candidate is AgentDelegationEvent => isDelegationEvent(candidate),
  )
  const delegated = childDelegationEvents.filter(
    (candidate): candidate is Extract<AgentDelegationEvent, { type: 'task_delegated' }> =>
      candidate.type === 'task_delegated',
  )
  const childSteps = collectRunSteps(childEvents)
  const childActions = childEvents.filter(isActionEvent)
  const unphasedChildActions = childActions.filter((action) => !action.phaseId)
  const childTraces = trace?.transientTraces ?? []
  const plan = childDelegationEvents.find(
    (candidate): candidate is Extract<AgentDelegationEvent, { type: 'plan_created' }> =>
      candidate.type === 'plan_created',
  )?.payload.plan
  const role = trace?.role ?? inferDelegatedRole(event)
  const scopeKind = trace?.scopeKind ?? inferDelegatedScope(event)
  const status = resolveDelegatedRunStatus(parentEvents, runId)
  const nextAncestors = new Set(ancestorRunIds)
  const hasCycle = nextAncestors.has(runId)
  nextAncestors.add(runId)

  return (
    <article
      className={styles.delegatedChild}
      key={runId}
      role="treeitem"
      aria-level={depth}
      data-tree-depth={depth}
      data-child-run={runId}
      data-child-outcome={status}
      data-run-role={role}
      data-scope-kind={scopeKind}
    >
      <div className={styles.delegatedChildHeader}>
        <div>
          <strong>{'filePath' in event.payload
            ? event.payload.filePath
            : event.payload.nodeId}</strong>
          <small>{event.payload.taskId}</small>
          <span className={styles.runMetadata}>
            <span className={styles.runRole}>{agentRoleLabel(ts, role)}</span>
            <span>{scopeLabel(ts, scopeKind)}</span>
          </span>
        </div>
        <span className={styles.statusBadge} data-run-status={status}>
          {runStatusLabel(ts, status)}
        </span>
      </div>

      {plan && (
        <div className={styles.childPlan} data-delegation-plan={plan.planId}>
          <strong>{ts('agentFlow.delegationPlan')}</strong>
          <span>{plan.objective}</span>
        </div>
      )}

      {groupAgentFlowPhaseTrace(childSteps, childActions, childTraces).map(
        ({ step, actions, traces }) => (
          <div className={styles.childPhase} key={step.id}>
            <AgentFlowStepRow
              step={step}
              isLast={false}
              index={0}
              onSelect={() => undefined}
              selected={false}
              hasCorrection={false}
            />
            {(actions.length > 0 || traces.length > 0) && (
              <section className={styles.phaseTrace}>
                {actions.map((action) => (
                  <AgentActionRow key={action.eventId} event={action} />
                ))}
                {traces.map((reasoning) => (
                  <TransientReasoningTrace key={reasoning.traceId} trace={reasoning} />
                ))}
              </section>
            )}
          </div>
        ),
      )}
      {unphasedChildActions.map((action) => (
        <AgentActionRow key={action.eventId} event={action} />
      ))}

      {hasCycle && (
        <p className={styles.emptyDelegation}>{ts('agentFlow.delegationCycle')}</p>
      )}
      {!hasCycle && delegated.length > 0 && (
        <div role="group" className={styles.delegatedChildren}>
          {delegated.map((childEvent) => (
            <DelegatedRunNode
              key={childEvent.payload.childRunId}
              event={childEvent}
              parentEvents={childDelegationEvents}
              tracesByRun={tracesByRun}
              depth={depth + 1}
              ancestorRunIds={nextAncestors}
            />
          ))}
        </div>
      )}
    </article>
  )
}

type DelegatedRunStatus =
  | 'pending'
  | 'running'
  | 'awaiting_review'
  | 'complete'
  | 'error'
  | 'applied'
  | 'not_applied'
  | 'recovery_required'

function resolveDelegatedRunStatus(
  parentEvents: AgentDelegationEvent[],
  childRunId: string,
): DelegatedRunStatus {
  const outcome = parentEvents.find(
    (candidate) => candidate.type === 'child_run_outcome' &&
      candidate.payload.childRunId === childRunId,
  )
  if (outcome?.type === 'child_run_outcome') return outcome.payload.status
  const completed = parentEvents.find(
    (candidate) => candidate.type === 'child_run_completed' &&
      candidate.payload.childRunId === childRunId,
  )
  if (completed?.type === 'child_run_completed') return completed.payload.status
  return parentEvents.some(
    (candidate) => candidate.type === 'child_run_started' &&
      candidate.payload.childRunId === childRunId,
  ) ? 'running' : 'pending'
}

function isDelegationEvent(event: AgentRunEvent): event is AgentDelegationEvent {
  return event.type === 'plan_created' ||
    event.type === 'task_delegated' ||
    event.type === 'child_run_started' ||
    event.type === 'child_run_completed' ||
    event.type === 'plan_completed' ||
    event.type === 'plan_partially_completed' ||
    event.type === 'child_run_outcome'
}

function inferDelegatedRole(
  event: Extract<AgentDelegationEvent, { type: 'task_delegated' }>,
): AgentRunRole {
  if (!('targetKind' in event.payload) || event.payload.targetKind === 'leaf-file') {
    if ('operation' in event.payload && event.payload.operation === 'create') {
      return 'leaf_file_creator'
    }
    if ('operation' in event.payload && event.payload.operation === 'delete') {
      return 'leaf_file_deleter'
    }
    return 'leaf_file_editor'
  }
  return plannerRoleForScope(event.payload.level)
}

function inferDelegatedScope(
  event: Extract<AgentDelegationEvent, { type: 'task_delegated' }>,
): AgentRunScope['kind'] {
  if (!('targetKind' in event.payload) || event.payload.targetKind === 'leaf-file') {
    if ('operation' in event.payload && event.payload.operation === 'create') return 'leaf-create'
    if ('operation' in event.payload && event.payload.operation === 'delete') return 'leaf-delete'
    return 'leaf-file'
  }
  return event.payload.level
}

function plannerRoleForScope(
  scope: 'global' | 'context' | 'container' | 'component',
): Extract<AgentRunRole, 'global' | 'context_planner' | 'container_planner' | 'node_planner'> {
  if (scope === 'global') return 'global'
  if (scope === 'context') return 'context_planner'
  if (scope === 'container') return 'container_planner'
  return 'node_planner'
}

function agentRoleLabel(
  ts: ReturnType<typeof useI18n>['ts'],
  role: AgentRunRole,
) {
  return ts(`agentFlow.roles.${role}` as 'agentFlow.roles.global')
}

function scopeLabel(
  ts: ReturnType<typeof useI18n>['ts'],
  scope: AgentRunScope['kind'],
) {
  return ts(`agentFlow.scopes.${scope}` as 'agentFlow.scopes.global')
}

function runStatusLabel(
  ts: ReturnType<typeof useI18n>['ts'],
  status: DelegatedRunStatus,
) {
  return ts(`agentFlow.runOutcome.${status}` as 'agentFlow.runOutcome.pending')
}

function collectRunSteps(events: AgentRunEvent[]): AgentFlowStep[] {
  const steps: AgentFlowStep[] = []
  for (const event of events) {
    if (
      (event.type === 'step_started' ||
        event.type === 'step_completed' ||
        event.type === 'step_failed') &&
      event.step
    ) {
      const status = event.type === 'step_failed'
        ? 'error'
        : event.type === 'step_completed'
          ? 'complete'
          : 'running'
      const next = { ...event.step, status } as AgentFlowStep
      const index = steps.findIndex((step) => step.id === next.id)
      if (index >= 0) steps[index] = next
      else steps.push(next)
    }
  }
  return steps
}

function isActionEvent(event: AgentRunEvent): event is AgentActionEvent {
  return event.type === 'context_assembled' ||
    event.type === 'context_attached' ||
    event.type === 'file_read' ||
    event.type === 'model_request' ||
    event.type === 'mcp_tool_call' ||
    event.type === 'tool_policy_decision' ||
    event.type === 'edit_plan_created' ||
    event.type === 'proposal_validation_result' ||
    event.type === 'batch_validation_result' ||
    event.type === 'decision_summary' ||
    event.type === 'diff_proposed' ||
    event.type === 'apply_result' ||
    event.type === 'verification_result' ||
    event.type === 'initialization_tranche_progress' ||
    event.type === 'memory_index_bound'
}

export function groupAgentFlowPhaseTrace(
  steps: AgentFlowStep[],
  actions: AgentActionEvent[],
  traces: AgentTransientTrace[],
) {
  return steps.map((step) => ({
    step,
    actions: actions.filter((event) => event.phaseId === step.id),
    traces: traces.filter((trace) => trace.phaseId === step.id),
  }))
}

function TransientReasoningTrace({ trace }: { trace: AgentTransientTrace }) {
  const { ts } = useI18n()
  return (
    <details className={styles.reasoningTrace} data-transient-trace="provider_reasoning">
      <summary>{ts('agentFlow.askReasoningTitle')}</summary>
      {trace.truncated && (
        <p className={styles.reasoningNotice}>{ts('agentFlow.askReasoningTruncated')}</p>
      )}
      <RestrictedMarkdown>{trace.content}</RestrictedMarkdown>
    </details>
  )
}
