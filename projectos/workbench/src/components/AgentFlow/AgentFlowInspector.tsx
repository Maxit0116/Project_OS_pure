import { useEffect, useRef, useState, type ReactNode } from 'react'
import type {
  AgentActionEvent,
  AgentActivity,
  AgentFlowStep,
  AgentTransientTrace,
} from '@contracts/index'
import type { FlowCorrection } from '../../state/workbenchStore'
import { useWorkbenchStore } from '../../state/workbenchStore'
import { useI18n } from '../../i18n'
import RestrictedMarkdown from '../ChatPanel/RestrictedMarkdown'
import Chip from '../ui/Chip'
import Button from '../ui/Button'
import AgentActionRow from './AgentActionRow'
import AgentActivityDetails from './AgentActivityDetails'
import styles from './AgentFlowInspector.module.css'

interface Props {
  step: AgentFlowStep | null
  followLive: boolean
  corrections: FlowCorrection[]
  actions: AgentActionEvent[]
  traces: AgentTransientTrace[]
  activities: AgentActivity[]
  selectedActivityId: string | null
  delegationContent?: ReactNode
  onFollowLive: () => void
  onClearSelection: () => void
}

export default function AgentFlowInspector({
  step,
  followLive,
  corrections,
  actions,
  traces,
  activities,
  selectedActivityId,
  delegationContent,
  onFollowLive,
  onClearSelection,
}: Props) {
  const selectFile = useWorkbenchStore((s) => s.selectFile)
  const injectFlowCorrection = useWorkbenchStore((s) => s.injectFlowCorrection)
  const { ts } = useI18n()
  const [correction, setCorrection] = useState('')
  const activityAnchorRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    setCorrection('')
  }, [step?.id])

  useEffect(() => {
    if (!selectedActivityId) return
    activityAnchorRef.current?.scrollIntoView({ block: 'nearest' })
  }, [selectedActivityId, step?.id, activities.length])

  const handleSubmitCorrection = () => {
    if (!step || !correction.trim()) return
    void injectFlowCorrection(step.id, correction.trim())
    setCorrection('')
  }

  return (
    <aside
      className={styles.panel}
      role="complementary"
      aria-label={ts('agentFlow.inspector.title')}
      data-agent-flow-inspector
    >
      <div className={styles.header}>
        <div className={styles.headerMain}>
          <h3>{ts('agentFlow.inspector.title')}</h3>
          {step ? (
            <>
              <p className={styles.stepLabel}>{step.label}</p>
              <p className={styles.stepKind}>{step.kind.replace(/_/g, ' ')}</p>
              <p className={styles.followHint}>
                {followLive
                  ? ts('agentFlow.inspector.followingLive')
                  : ts('agentFlow.inspector.locked')}
              </p>
            </>
          ) : (
            <p className={styles.followHint}>{ts('agentFlow.inspector.empty')}</p>
          )}
        </div>
        <div className={styles.headerActions}>
          {!followLive ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={onFollowLive}
              data-agent-flow-follow-live
            >
              {ts('agentFlow.inspector.followLive')}
            </Button>
          ) : null}
          {step && !followLive ? (
            <button
              type="button"
              className={styles.close}
              aria-label={ts('agentFlow.close')}
              onClick={onClearSelection}
            >
              ×
            </button>
          ) : null}
        </div>
      </div>

      <div className={styles.body}>
        {!step ? (
          <div className={styles.empty}>{ts('agentFlow.inspector.empty')}</div>
        ) : (
          <>
            {step.outputSummary ? (
              <section className={styles.section}>
                <p className={styles.summary}>{step.outputSummary}</p>
              </section>
            ) : null}

            <InspectorSection title={ts('agentFlow.inspector.reasoning')}>
              {traces.length === 0 ? (
                <p
                  className={styles.emptySection}
                  data-agent-flow-reasoning-empty
                >
                  {ts('agentFlow.inspector.reasoningEmpty')}
                </p>
              ) : (
                traces.map((trace) => (
                  <div
                    key={trace.traceId}
                    className={styles.reasoningBlock}
                    data-transient-trace="provider_reasoning"
                  >
                    {trace.truncated ? (
                      <p className={styles.reasoningNotice}>
                        {ts('agentFlow.askReasoningTruncated')}
                      </p>
                    ) : null}
                    <RestrictedMarkdown>{trace.content}</RestrictedMarkdown>
                  </div>
                ))
              )}
            </InspectorSection>

            <InspectorSection title={ts('agentFlow.inspector.actions')}>
              {actions.length === 0 ? (
                <p className={styles.emptySection}>{ts('agentFlow.inspector.actionsEmpty')}</p>
              ) : (
                actions.map((event) => (
                  <AgentActionRow key={event.eventId} event={event} />
                ))
              )}
            </InspectorSection>

            <InspectorSection title={ts('agentFlow.inspector.activity')}>
              <div ref={(node) => { activityAnchorRef.current = node }}>
                {activities.length === 0 ? (
                  <p className={styles.emptySection}>{ts('agentFlow.inspector.activityEmpty')}</p>
                ) : (
                  <AgentActivityDetails
                    activities={activities}
                    selectedId={selectedActivityId}
                    preferExpandSelected
                  />
                )}
              </div>
            </InspectorSection>

            {step.relatedFiles.length > 0 ? (
              <InspectorSection title={ts('agentFlow.inspector.files')}>
                <div className={styles.files}>
                  {step.relatedFiles.map((file) => (
                    <Chip key={file} onClick={() => selectFile(file)}>
                      {file}
                    </Chip>
                  ))}
                </div>
              </InspectorSection>
            ) : null}

            <InspectorSection title={ts('agentFlow.inspector.corrections')}>
              {corrections.length > 0 ? (
                <div className={styles.correctionHistory}>
                  <span className={styles.correctionLabel}>
                    {ts('agentFlow.correctionHistory')}
                  </span>
                  <ul>
                    {corrections.map((item) => (
                      <li key={item.id}>{item.message}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <div className={styles.correction}>
                <label className={styles.correctionLabel}>{ts('agentFlow.correction')}</label>
                <textarea
                  className={styles.correctionInput}
                  value={correction}
                  onChange={(event) => setCorrection(event.target.value)}
                  placeholder={ts('agentFlow.correctionPlaceholder')}
                  rows={2}
                />
                <Button size="sm" onClick={handleSubmitCorrection}>
                  {ts('agentFlow.submitCorrection')}
                </Button>
              </div>
            </InspectorSection>
          </>
        )}

        {delegationContent ? (
          <InspectorSection title={ts('agentFlow.inspector.delegation')}>
            <div className={styles.delegationWrap}>{delegationContent}</div>
          </InspectorSection>
        ) : null}
      </div>
    </aside>
  )
}

function InspectorSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={styles.section}>
      <h4 className={styles.sectionTitle}>{title}</h4>
      {children}
    </section>
  )
}
