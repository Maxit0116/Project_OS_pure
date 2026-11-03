import { useMemo, useState } from 'react'
import { useI18n } from '../../../i18n'
import AgentPoolMiniWaterfall from './AgentPoolMiniWaterfall'
import AgentPoolSpanInspector from './AgentPoolSpanInspector'
import { barsForMajorAction } from './projectAgentPoolTrace'
import type { AgentPoolFlowStep, AgentPoolSpan, AgentPoolTask } from './projectAgentPool'
import styles from './AgentPoolRow.module.css'

interface Props {
  task: AgentPoolTask
  steps: AgentPoolFlowStep[]
  spans: AgentPoolSpan[]
  originMs: number
  nowMs: number
  currentAction: string
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
          {currentAction}
        </p>
      </div>
    )
  }

  return (
    <div className={styles.expand} aria-label={ts('agentFlow.pool.miniFlow')}>
      <div className={styles.majorList} role="list">
        {majors.map((major) => {
          const selected = selectedMajorId === major.actionId
          return (
            <button
              key={major.actionId}
              type="button"
              role="listitem"
              className={styles.majorChip}
              data-status={major.status}
              data-selected={selected ? 'true' : undefined}
              aria-pressed={selected}
              onClick={() => {
                setSelectedMajorId(selected ? null : major.actionId)
                setDrillSpans(false)
                setSelectedSpanId(null)
              }}
            >
              <span className={styles.majorName}>{major.name}</span>
              <span className={styles.majorMeta}>
                {major.status}
                {major.attempt && major.attempt > 1
                  ? ` · ${ts('agentFlow.pool.attempt', { n: major.attempt })}`
                  : ''}
                {major.timingQuality !== 'exact'
                  ? ` · ${ts('agentFlow.pool.timingDerived')}`
                  : ''}
              </span>
            </button>
          )
        })}
      </div>

      <AgentPoolMiniWaterfall
        spans={detailBars.length > 0 ? detailBars : spans.filter((s) => s.kind !== 'agent')}
        originMs={originMs}
        nowMs={nowMs}
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
        </div>
      ) : (
        <p className={styles.expandCurrent}>
          <span className={styles.expandCurrentLabel}>{ts('agentFlow.pool.currentAction')}</span>
          {currentAction}
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
