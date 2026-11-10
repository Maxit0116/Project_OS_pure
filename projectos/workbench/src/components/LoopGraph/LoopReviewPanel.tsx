import { useMemo, useState } from 'react'
import type {
  LoopCompileResult,
  LoopGoalContext,
  LoopHitlAnswer,
  LoopInstance,
  LoopSpecNode,
} from '@contracts/index'
import { useI18n } from '../../i18n'
import Checkbox from '../ui/Checkbox'
import LoopReviewPathMap from './LoopReviewPathMap'
import {
  areReviewGatesReady,
  isReviewCompileStale,
} from './loopReviewLayout'
import { visualForKey, visualKeyFromArchitecture } from './loopNodeVisuals'
import styles from './LoopReviewPanel.module.css'

export type LoopReviewPanelProps = {
  compileResult: LoopCompileResult
  draftRevision: number
  goalContext?: LoopGoalContext | null
  activeInstance?: LoopInstance | null
  acceptedAssumptions: Record<string, boolean>
  confirmedCycles: Record<string, boolean>
  onAcceptedAssumptionsChange: (next: Record<string, boolean>) => void
  onConfirmedCyclesChange: (next: Record<string, boolean>) => void
  onBackToDraw: () => void
  onResolveHitl: (answers: LoopHitlAnswer[]) => void
}

function neighborsOf(
  nodeId: string,
  edges: LoopCompileResult['specDraft']['edges'],
): { upstream: string[]; downstream: string[] } {
  const upstream: string[] = []
  const downstream: string[] = []
  for (const edge of edges) {
    if (edge.kind === 'feedback') continue
    if (edge.to === nodeId) upstream.push(edge.from)
    if (edge.from === nodeId) downstream.push(edge.to)
  }
  return { upstream, downstream }
}

export function reviewApproveEnabled(input: {
  compileResult: LoopCompileResult | null
  draftRevision: number
  acceptedAssumptions: Record<string, boolean>
  confirmedCycles: Record<string, boolean>
}): boolean {
  const { compileResult } = input
  if (!compileResult) return false
  if (
    isReviewCompileStale(input.draftRevision, compileResult.specDraft.graphRevision)
  ) {
    return false
  }
  return areReviewGatesReady(
    compileResult.assumptions,
    compileResult.cycleGates,
    input.acceptedAssumptions,
    input.confirmedCycles,
  )
}

export default function LoopReviewPanel({
  compileResult,
  draftRevision,
  goalContext = null,
  activeInstance = null,
  acceptedAssumptions,
  confirmedCycles,
  onAcceptedAssumptionsChange,
  onConfirmedCyclesChange,
  onBackToDraw,
  onResolveHitl,
}: LoopReviewPanelProps) {
  const { ts } = useI18n()
  const [intentOpen, setIntentOpen] = useState(false)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [highlightNodeId, setHighlightNodeId] = useState<string | null>(null)
  const [highlightEdgeId, setHighlightEdgeId] = useState<string | null>(null)

  const stale = isReviewCompileStale(
    draftRevision,
    compileResult.specDraft.graphRevision,
  )
  const spec = compileResult.specDraft
  const nodesById = useMemo(
    () => new Map(spec.nodes.map((node) => [node.id, node])),
    [spec.nodes],
  )
  const selected: LoopSpecNode | null = selectedNodeId
    ? (nodesById.get(selectedNodeId) ?? null)
    : null
  const selectedVisual = selected
    ? visualForKey(visualKeyFromArchitecture(selected))
    : null
  const selectedNeighbors = selected
    ? neighborsOf(selected.id, spec.edges)
    : null

  const pendingGates =
    compileResult.assumptions.filter((item) => !acceptedAssumptions[item.id]).length +
    compileResult.cycleGates.filter((gate) => !confirmedCycles[gate.edgeId]).length

  const intentGoal = goalContext?.goal?.trim() || spec.goal
  const hasContextLists = Boolean(
    goalContext &&
      (goalContext.constraints.length > 0 ||
        goalContext.doneWhen.length > 0 ||
        goalContext.outOfScope.length > 0),
  )

  return (
    <div className={styles.panel} data-loop-review-panel="">
      {stale ? (
        <div className={styles.stale} role="status">
          <span>{ts('chat.loopGraph.reviewStale')}</span>
          <button type="button" className={styles.staleAction} onClick={onBackToDraw}>
            {ts('chat.loopGraph.reviewStaleAction')}
          </button>
        </div>
      ) : null}

      <section className={styles.strip} aria-label={ts('chat.loopGraph.reviewIntent')}>
        <div className={styles.stripHeader}>
          <h3 className={styles.stripGoal} title={intentGoal}>
            {intentGoal}
          </h3>
          <div className={styles.stripMeta}>
            <span className={styles.chip}>
              {ts('chat.loopGraph.reviewChipNodes', {
                count: String(spec.nodes.length),
              })}
            </span>
            <span className={styles.chip}>
              {ts('chat.loopGraph.reviewChipFeedback', {
                count: String(compileResult.cycleGates.length),
              })}
            </span>
            <span className={`${styles.chip} ${pendingGates > 0 ? '' : styles.chipMuted}`}>
              {ts('chat.loopGraph.reviewChipPendingGates', {
                count: String(pendingGates),
              })}
            </span>
            {goalContext ? (
              <span className={`${styles.chip} ${styles.chipMuted}`}>
                {ts('chat.loopGraph.goalContextStatus', {
                  status: ts(
                    `chat.loopGraph.goalContextStatusValue.${goalContext.status}`,
                  ),
                  revision: String(goalContext.revision),
                })}
              </span>
            ) : null}
            {hasContextLists ? (
              <button
                type="button"
                className={styles.toggle}
                aria-expanded={intentOpen}
                onClick={() => setIntentOpen((open) => !open)}
              >
                {intentOpen
                  ? ts('chat.loopGraph.reviewIntentCollapse')
                  : ts('chat.loopGraph.reviewIntentExpand')}
              </button>
            ) : null}
          </div>
        </div>
        {!goalContext ? (
          <p className={styles.stripHint}>{ts('chat.loopGraph.reviewIntentFallback')}</p>
        ) : null}
        {intentOpen && goalContext ? (
          <div className={styles.stripBody}>
            {goalContext.constraints.length > 0 ? (
              <p className={styles.stripSection}>
                <strong>{ts('chat.loopGraph.goalConstraints')}</strong>:{' '}
                {goalContext.constraints.join('; ')}
              </p>
            ) : null}
            {goalContext.doneWhen.length > 0 ? (
              <p className={styles.stripSection}>
                <strong>{ts('chat.loopGraph.goalDoneWhen')}</strong>:{' '}
                {goalContext.doneWhen.join('; ')}
              </p>
            ) : null}
            {goalContext.outOfScope.length > 0 ? (
              <p className={styles.stripSection}>
                <strong>{ts('chat.loopGraph.goalOutOfScope')}</strong>:{' '}
                {goalContext.outOfScope.join('; ')}
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

      <div className={styles.split}>
        <div className={styles.mapCol}>
          <LoopReviewPathMap
            spec={spec}
            selectedNodeId={selectedNodeId}
            highlightNodeId={highlightNodeId}
            highlightEdgeId={highlightEdgeId}
            caption={ts('chat.loopGraph.reviewPathMapCaption')}
            onSelectNode={setSelectedNodeId}
          />
        </div>

        <aside className={styles.gateCol} aria-label={ts('chat.loopGraph.reviewGates')}>
          {activeInstance?.status === 'awaiting_hitl' ? (
            <div>
              <h4 className={styles.sectionTitle}>{ts('chat.loopGraph.hitl')}</h4>
              <p className={styles.empty}>{ts('chat.loopGraph.hitlHint')}</p>
              <div className={styles.hitlActions}>
                <button
                  type="button"
                  className={styles.actionButton}
                  onClick={() =>
                    onResolveHitl([{ questionId: 'stop', answer: 'stop' }])
                  }
                >
                  {ts('chat.loopGraph.hitlStop')}
                </button>
                <button
                  type="button"
                  className={`${styles.actionButton} ${styles.actionButtonPrimary}`}
                  onClick={() =>
                    onResolveHitl([{ questionId: 'continue', answer: 'continue' }])
                  }
                >
                  {ts('chat.loopGraph.hitlContinue')}
                </button>
              </div>
            </div>
          ) : null}

          <div>
            <h4 className={styles.sectionTitle}>{ts('chat.loopGraph.reviewPolicy')}</h4>
            <div className={styles.policyRow}>
              <span className={styles.chip}>
                {ts('chat.loopGraph.reviewStopRounds', {
                  count: String(spec.stopPolicy.maxRounds),
                })}
              </span>
              <span className={styles.chip}>
                {ts('chat.loopGraph.reviewRetry', {
                  onFailure: spec.retryPolicy.onFailure,
                  count: String(spec.retryPolicy.maxAutoRetries),
                })}
              </span>
              {spec.permissions.slice(0, 4).map((perm) => (
                <span key={perm.id} className={styles.chip} title={perm.scope}>
                  {perm.action}
                  {perm.requiresApproval ? ' · ✓' : ''}
                </span>
              ))}
            </div>
          </div>

          <div>
            <h4 className={styles.sectionTitle}>{ts('chat.loopGraph.assumptions')}</h4>
            {compileResult.assumptions.length === 0 ? (
              <p className={styles.empty}>{ts('chat.loopGraph.noAssumptions')}</p>
            ) : (
              <div className={styles.gateList}>
                {compileResult.assumptions.map((item) => (
                  <div
                    key={item.id}
                    className={`${styles.gateRow} ${
                      highlightNodeId && item.text.includes(highlightNodeId)
                        ? styles.gateRowActive
                        : ''
                    }`}
                    onMouseEnter={() => {
                      const match = spec.nodes.find((node) =>
                        item.text.includes(`"${node.id}"`) ||
                        item.text.includes(node.goal.slice(0, 24)),
                      )
                      setHighlightNodeId(match?.id ?? null)
                    }}
                    onMouseLeave={() => setHighlightNodeId(null)}
                  >
                    <Checkbox
                      checked={acceptedAssumptions[item.id] ?? false}
                      onCheckedChange={(next) =>
                        onAcceptedAssumptionsChange({
                          ...acceptedAssumptions,
                          [item.id]: next,
                        })
                      }
                      label={item.text}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <h4 className={styles.sectionTitle}>{ts('chat.loopGraph.cycleGates')}</h4>
            {compileResult.cycleGates.length === 0 ? (
              <p className={styles.empty}>{ts('chat.loopGraph.noCycles')}</p>
            ) : (
              <div className={styles.gateList}>
                {compileResult.cycleGates.map((gate) => (
                  <div
                    key={gate.edgeId}
                    className={`${styles.gateRow} ${
                      highlightEdgeId === gate.edgeId ? styles.gateRowActive : ''
                    }`}
                    onMouseEnter={() => setHighlightEdgeId(gate.edgeId)}
                    onMouseLeave={() => setHighlightEdgeId(null)}
                  >
                    <Checkbox
                      checked={confirmedCycles[gate.edgeId] ?? false}
                      onCheckedChange={(next) =>
                        onConfirmedCyclesChange({
                          ...confirmedCycles,
                          [gate.edgeId]: next,
                        })
                      }
                      label={`${gate.triggerWhen} · max ${gate.maxRounds} · ${gate.onContinuousFailure}`}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          {selected && selectedVisual ? (
            <div className={styles.detail}>
              <h4 className={styles.detailTitle}>
                {selectedVisual.shortLabel}
              </h4>
              <p className={styles.detailMeta}>
                {selected.type ?? selected.role}
                {selected.agentRole ? ` · ${selected.agentRole}` : ''}
                {selected.humanMode ? ` · ${selected.humanMode}` : ''}
              </p>
              <p className={styles.detailBody}>{selected.goal}</p>
              {selected.acceptance.length > 0 ? (
                <ul className={styles.detailList}>
                  {selected.acceptance.map((item) => (
                    <li key={item.id}>{item.description}</li>
                  ))}
                </ul>
              ) : null}
              {selectedNeighbors ? (
                <p className={styles.neighbors}>
                  {selectedNeighbors.upstream.length > 0
                    ? `← ${selectedNeighbors.upstream.join(', ')}`
                    : '← ∅'}
                  {'  ·  '}
                  {selectedNeighbors.downstream.length > 0
                    ? `${selectedNeighbors.downstream.join(', ')} →`
                    : '∅ →'}
                </p>
              ) : null}
            </div>
          ) : (
            <p className={styles.empty}>{ts('chat.loopGraph.reviewSelectNodeHint')}</p>
          )}
        </aside>
      </div>
    </div>
  )
}
