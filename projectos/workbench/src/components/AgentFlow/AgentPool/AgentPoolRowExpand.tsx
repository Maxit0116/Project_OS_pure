import { useMemo, useState } from 'react'
import { CircleAlert } from 'lucide-react'
import type { AgentPoolRunKpi } from '@contracts/index'
import { useI18n } from '../../../i18n'
import AgentPoolMiniWaterfall from './AgentPoolMiniWaterfall'
import AgentPoolSpanInspector from './AgentPoolSpanInspector'
import { barsForMajorAction } from './projectAgentPoolTrace'
import type { AgentPoolFlowStep, AgentPoolSpan, AgentPoolTask } from './projectAgentPool'
import { formatElapsed } from './poolTiming'
import styles from './AgentPoolRow.module.css'

interface Props {
  task: AgentPoolTask
  steps: AgentPoolFlowStep[]
  spans: AgentPoolSpan[]
  originMs: number
  nowMs: number
  currentAction: string
}

const LEGEND_KINDS = [
  'major',
  'model',
  'tool',
  'file',
  'apply',
  'verify',
  'wait',
  'handoff',
] as const

function formatKpiTokens(kpi: AgentPoolRunKpi): string | null {
  if (kpi.tokensIn == null && kpi.tokensOut == null) return null
  const inn = kpi.tokensIn ?? 0
  const out = kpi.tokensOut ?? 0
  return `${inn} / ${out}`
}

export default function AgentPoolRowExpand({
  task,
  steps,
  spans,
  originMs,
  nowMs,
  currentAction,
}: Props) {
  const { ts } = useI18n()
  const [selectedMajorId, setSelectedMajorId] = useState<string | null>(null)
  const [drillSpans, setDrillSpans] = useState(false)
  const [selectedSpanId, setSelectedSpanId] = useState<string | null>(null)

  const majors = task.majorActions
  const useTrace = majors.length > 0 || (task.traceSpans?.length ?? 0) > 0
  const kpi = task.runKpi

  const detailBars: AgentPoolSpan[] = useMemo(() => {
    if (!task.trace || !selectedMajorId) {
      return spans.filter((span) => span.kind !== 'agent')
    }
    return barsForMajorAction(task.trace, selectedMajorId, drillSpans).map((bar) => ({
      id: bar.id,
      parentId: bar.parentId,
      kind: (bar.kind === 'major' ? 'major' : bar.kind) as AgentPoolSpan['kind'],
      label: bar.label,
      status: bar.status,
      startMs: bar.startMs,
      endMs: bar.endMs,
      timingQuality: bar.timingQuality,
      level: bar.level,
      attempt: bar.attempt,
    }))
  }, [task.trace, selectedMajorId, drillSpans, spans])

  const selectedSpan =
    task.traceSpans.find((span) => span.spanId === selectedSpanId) ?? null
  const selectedMajor =
    majors.find((major) => major.actionId === selectedMajorId) ?? null

  if (!useTrace && steps.length === 0) {
    return (
      <div className={styles.expand} aria-label={ts('agentFlow.pool.miniFlow')}>
        <p className={styles.expandEmpty}>
          {currentAction || ts('agentFlow.pool.noStepsYet')}
        </p>
      </div>
    )
  }

  if (!useTrace) {
    return (
      <div className={styles.expand} aria-label={ts('agentFlow.pool.miniFlow')}>
        <ol className={styles.miniFlow}>
          {steps.map((step) => (
            <li key={step.id} className={styles.miniStep} data-status={step.status}>
              <span className={styles.miniDot} aria-hidden />
              <span className={styles.miniLabel}>{step.label}</span>
              <span className={styles.miniStatus}>{step.status}</span>
            </li>
          ))}
        </ol>
        <p className={styles.expandCurrent}>
          <span className={styles.expandCurrentLabel}>{ts('agentFlow.pool.currentAction')}</span>
          <span key={currentAction} className={styles.lifeActionInline}>
            {currentAction}
          </span>
        </p>
      </div>
    )
  }

  const tokenText = kpi ? formatKpiTokens(kpi) : null

  return (
    <div className={styles.expand} aria-label={ts('agentFlow.pool.miniFlow')}>
      {kpi ? (
        <div className={styles.kpiStrip} role="group" aria-label={ts('agentFlow.pool.kpiAria')}>
          <span className={styles.kpiItem}>
            <span className={styles.kpiLabel}>{ts('agentFlow.pool.kpiDuration')}</span>
            <span key={`d-${kpi.durationMs}`} className={styles.kpiValue}>
              {formatElapsed(kpi.durationMs)}
            </span>
          </span>
          <span className={styles.kpiItem}>
            <span className={styles.kpiLabel}>{ts('agentFlow.pool.kpiModel')}</span>
            <span key={`m-${kpi.modelCallCount}`} className={styles.kpiValue}>
              {kpi.modelCallCount}
            </span>
          </span>
          <span className={styles.kpiItem}>
            <span className={styles.kpiLabel}>{ts('agentFlow.pool.kpiTool')}</span>
            <span key={`t-${kpi.toolCallCount}`} className={styles.kpiValue}>
              {kpi.toolCallCount}
            </span>
          </span>
          <span className={styles.kpiItem} data-warn={kpi.errorCount > 0 ? 'true' : undefined}>
            <span className={styles.kpiLabel}>{ts('agentFlow.pool.kpiErrors')}</span>
            <span key={`e-${kpi.errorCount}`} className={styles.kpiValue}>
              {kpi.errorCount > 0 ? (
                <span className={styles.kpiError}>
                  <CircleAlert size={11} aria-hidden />
                  {kpi.errorCount}
                </span>
              ) : (
                kpi.errorCount
              )}
            </span>
          </span>
          {tokenText ? (
            <span className={styles.kpiItem}>
              <span className={styles.kpiLabel}>{ts('agentFlow.pool.kpiTokens')}</span>
              <span key={`tok-${tokenText}`} className={styles.kpiValue}>
                {tokenText}
              </span>
            </span>
          ) : null}
        </div>
      ) : null}

      <AgentPoolMiniWaterfall
        spans={detailBars.length > 0 ? detailBars : spans.filter((s) => s.kind !== 'agent')}
        originMs={originMs}
        nowMs={nowMs}
        showAxisTicks
        selectedSpanId={selectedSpanId}
        onSelectSpan={(span) => {
          if (!span) {
            setSelectedSpanId(null)
            return
          }
          if (span.level === 1 || span.kind === 'major') {
            setSelectedMajorId(span.id)
            setDrillSpans(true)
            setSelectedSpanId(null)
            return
          }
          if (span.level === 2) {
            setDrillSpans(true)
            setSelectedSpanId(null)
            return
          }
          setSelectedSpanId(span.id)
        }}
      />

      <ul className={styles.kindLegend} aria-label={ts('agentFlow.pool.legendAria')}>
        {LEGEND_KINDS.map((kind) => (
          <li key={kind} className={styles.kindLegendItem}>
            <span className={styles.kindSwatch} data-kind={kind} aria-hidden />
            <span>{ts(`agentFlow.pool.kind.${kind}` as 'agentFlow.pool.kind.major')}</span>
          </li>
        ))}
      </ul>

      {selectedMajor ? (
        <div className={styles.expandActions}>
          <button
            type="button"
            className={styles.drillBtn}
            onClick={() => setDrillSpans((value) => !value)}
          >
            {drillSpans
              ? ts('agentFlow.pool.hideSpans')
              : ts('agentFlow.pool.showSpans')}
          </button>
          {selectedMajor.attempt && selectedMajor.attempt > 1 ? (
            <span className={styles.retryHint}>
              {ts('agentFlow.pool.attempt', { n: selectedMajor.attempt })}
            </span>
          ) : null}
          {selectedMajor.status === 'failed' ? (
            <span className={styles.retryHint} data-failed="true">
              <CircleAlert size={12} aria-hidden />
              {ts('agentFlow.pool.spanFailed')}
            </span>
          ) : null}
        </div>
      ) : (
        <p className={styles.expandCurrent}>
          <span className={styles.expandCurrentLabel}>{ts('agentFlow.pool.currentAction')}</span>
          <span key={currentAction} className={styles.lifeActionInline}>
            {currentAction}
          </span>
        </p>
      )}

      {selectedSpan ? (
        <AgentPoolSpanInspector
          span={selectedSpan}
          majorActionName={selectedMajor?.name}
        />
      ) : null}
    </div>
  )
}
