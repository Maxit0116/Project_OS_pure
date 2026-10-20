import { useEffect, useMemo, useState } from 'react'
import type {
  CodeFileUnderstandingEntry,
  FileEntry,
  FileRelation,
  FunctionalEdge,
  FunctionalNode,
  ProjectGraph,
} from '@contracts/index'
import { X } from 'lucide-react'
import {
  agentFlowActivityIdsForLive,
  listEditedPathsForNode,
  listNodeActivities,
  listTouchedPathsForNode,
} from '../../../../services/live-graph/index.js'
import { useI18n } from '../../i18n'
import { useChatSessionStore } from '../../state/chatSessionStore'
import { useWorkbenchStore } from '../../state/workbenchStore'
import { isTrivialCodeDescription } from './codeFileDescription'
import {
  buildNodeUnderstanding,
  type ChangeRiskLevel,
} from './codeFileUnderstanding'
import { codeNodeDisplayTitle, codeNodeFilePath, isCodeElementNode } from './codeNodeInteraction'
import { nodeDetailCopy } from './nodeCopy'
import styles from './C4NodeDetailDrawer.module.css'

interface Props {
  node: FunctionalNode | null
  /** Projected layer nodes/edges (code_file_* live here). */
  layerNodes: FunctionalNode[]
  layerEdges: FunctionalEdge[]
  fileIndex: FileEntry[]
  fileRelations: FileRelation[]
  durableGraph: ProjectGraph | null
  onClose: () => void
}

type DetailTab = 'overview' | 'diff' | 'activity' | 'relations' | 'controls'

function confidenceLabel(confidence: number): string {
  return `${Math.round(Math.max(0, Math.min(1, confidence)) * 100)}%`
}

function riskClass(risk: ChangeRiskLevel): string {
  if (risk === 'high') return styles.riskHigh
  if (risk === 'medium') return styles.riskMedium
  return styles.riskLow
}

export default function C4NodeDetailDrawer({
  node,
  layerNodes,
  layerEdges,
  fileIndex,
  fileRelations,
  durableGraph,
  onClose,
}: Props) {
  const { ts } = useI18n()
  const client = useWorkbenchStore((s) => s.client)
  const project = useWorkbenchStore((s) => s.project)
  const executionOverlay = useWorkbenchStore((s) => s.executionOverlay)
  const verificationResult = useWorkbenchStore((s) => s.verificationResult)
  const liveGraphFocusTaskId = useWorkbenchStore((s) => s.liveGraphFocusTaskId)
  const setLiveGraphFocusTask = useWorkbenchStore((s) => s.setLiveGraphFocusTask)
  const navigateToDiffReviewFile = useWorkbenchStore((s) => s.navigateToDiffReviewFile)
  const setSelectedActivityId = useWorkbenchStore((s) => s.setSelectedActivityId)
  const flowStatus = useWorkbenchStore((s) => s.flowStatus)
  const liveGraphPausedRunId = useWorkbenchStore((s) => s.liveGraphPausedRunId)
  const verificationCommandApproval = useWorkbenchStore((s) => s.verificationCommandApproval)
  const addGraphContextFromNode = useWorkbenchStore((s) => s.addGraphContextFromNode)
  const sendGraphInstructionFromNode = useWorkbenchStore((s) => s.sendGraphInstructionFromNode)
  const pauseAgentFromGraph = useWorkbenchStore((s) => s.pauseAgentFromGraph)
  const resumeAgentFromGraph = useWorkbenchStore((s) => s.resumeAgentFromGraph)
  const approveFromGraph = useWorkbenchStore((s) => s.approveFromGraph)
  const rejectFromGraph = useWorkbenchStore((s) => s.rejectFromGraph)
  const [llmUnderstanding, setLlmUnderstanding] =
    useState<CodeFileUnderstandingEntry | null>(null)
  const [llmLoading, setLlmLoading] = useState(false)
  const [llmError, setLlmError] = useState<string | null>(null)
  const [tab, setTab] = useState<DetailTab>('overview')
  const [instruction, setInstruction] = useState('')

  const isCodeNode = node ? isCodeElementNode(node) : false
  const filePath = node && isCodeNode ? codeNodeFilePath(node) : null

  useEffect(() => {
    setTab('overview')
    setInstruction('')
  }, [node?.id])

  useEffect(() => {
    if (!node || !isCodeNode || !filePath || !project) {
      setLlmUnderstanding(null)
      setLlmLoading(false)
      setLlmError(null)
      return
    }

    let cancelled = false
    setLlmLoading(true)
    setLlmError(null)
    setLlmUnderstanding(null)

    void client
      .ensureCodeFileUnderstanding(project.projectId, filePath)
      .then((entry) => {
        if (cancelled) return
        setLlmUnderstanding(entry)
        setLlmLoading(false)
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setLlmError(
          error instanceof Error ? error.message : ts('map.c4Detail.understandingFailed'),
        )
        setLlmLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [client, filePath, isCodeNode, node, project, ts])

  const liveActivities = useMemo(
    () => (node ? listNodeActivities(executionOverlay, node.id) : []),
    [executionOverlay, node],
  )
  const editedPaths = useMemo(
    () => (node ? listEditedPathsForNode(executionOverlay, node.id) : []),
    [executionOverlay, node],
  )
  const touchedPaths = useMemo(
    () => (node ? listTouchedPathsForNode(executionOverlay, node.id) : []),
    [executionOverlay, node],
  )
  const taskIds = useMemo(() => {
    const ids = new Set<string>()
    for (const activity of liveActivities) {
      if (activity.taskId) ids.add(activity.taskId)
    }
    return [...ids]
  }, [liveActivities])
  const needsApproval = useMemo(
    () =>
      liveActivities.some(
        (activity) =>
          activity.kind === 'needs_approval' && activity.status === 'running',
      ) || verificationCommandApproval?.status === 'approval_required',
    [liveActivities, verificationCommandApproval],
  )
  const verificationNarrative = useMemo(() => {
    const evidence = verificationResult?.evidence
    if (evidence) {
      const firstCommand = evidence.commands[0]
      return {
        runId: evidence.runId,
        status: evidence.status,
        reason: evidence.reason,
        evidenceId: evidence.evidenceId,
        summary: firstCommand?.summary,
        command: firstCommand
          ? `${firstCommand.tool}${firstCommand.ok ? '' : ' (failed)'}`.slice(0, 120)
          : undefined,
        suggestedTests: evidence.suggestedTests,
        acceptanceCriteria: evidence.acceptanceCriteria ?? [],
        unexpectedPaths: evidence.unexpectedPaths,
      }
    }
    const narrative = executionOverlay?.verificationNarrative
    if (!narrative) return null
    return {
      ...narrative,
      suggestedTests: [] as string[],
      acceptanceCriteria: [] as string[],
      unexpectedPaths: [] as string[],
    }
  }, [executionOverlay?.verificationNarrative, verificationResult?.evidence])

  if (!node) return null

  const detail = nodeDetailCopy(node)
  const understanding = buildNodeUnderstanding({
    node,
    layerNodes,
    layerEdges,
    fileIndex,
    fileRelations,
    durableGraph,
  })
  const linked = node.linkedFiles.slice(0, 12)
  const title = understanding.isCodeNode ? codeNodeDisplayTitle(node) : node.name
  const usedByTitle = understanding.isCodeNode
    ? ts('map.c4Detail.usedBy')
    : ts('map.c4Detail.upstream')
  const dependsOnTitle = understanding.isCodeNode
    ? ts('map.c4Detail.dependsOn')
    : ts('map.c4Detail.downstream')

  const heuristicDescription = detail.description
  const showHeuristicDescription =
    !understanding.isCodeNode ||
    (!llmUnderstanding &&
      !llmLoading &&
      heuristicDescription &&
      !isTrivialCodeDescription(node, heuristicDescription))

  const descriptionText =
    llmUnderstanding?.description ??
    (showHeuristicDescription ? heuristicDescription : undefined)
  const roleText = llmUnderstanding?.role

  const openActivityInAgentFlow = (activityIdCandidates: string[]) => {
    const preferred = activityIdCandidates[0]
    if (!preferred) return
    setSelectedActivityId(preferred)
    useChatSessionStore.getState().presentAgentFlow()
  }

  const tabs: Array<{ id: DetailTab; label: string }> = [
    { id: 'overview', label: ts('map.c4Detail.tabs.overview') },
    { id: 'diff', label: ts('map.c4Detail.tabs.diff') },
    { id: 'activity', label: ts('map.c4Detail.tabs.activity') },
    { id: 'relations', label: ts('map.c4Detail.tabs.relations') },
    { id: 'controls', label: ts('map.c4Detail.tabs.controls') },
  ]

  return (
    <aside
      className={styles.drawer}
      aria-label={ts('map.c4Detail.title')}
      data-testid="c4-node-detail-drawer"
    >
      <header className={styles.header}>
        <div className={styles.heading}>
          <h2 className={styles.title}>{title}</h2>
          <p className={styles.meta}>
            {[node.elementType, node.level, node.technology]
              .filter(Boolean)
              .join(' · ')}
          </p>
          {understanding.stereotype || understanding.fileType ? (
            <div className={styles.chips}>
              {understanding.stereotype ? (
                <span className={styles.chip}>{understanding.stereotype}</span>
              ) : null}
              {understanding.fileType ? (
                <span className={styles.chip}>
                  {ts(`map.fileTypes.${understanding.fileType}`)}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
        <button
          type="button"
          className={`${styles.close} tech-focus`}
          onClick={onClose}
          aria-label={ts('map.c4Detail.close')}
        >
          <X size={16} aria-hidden />
        </button>
      </header>

      <div className={styles.tabs} role="tablist" aria-label={ts('map.c4Detail.tabsLabel')}>
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={`${styles.tab} ${tab === item.id ? styles.tabActive : ''} tech-focus`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className={styles.body}>
        {tab === 'overview' ? (
          <>
            {understanding.filePath ? (
              <section className={styles.section}>
                <h3 className={styles.sectionTitle}>{ts('map.c4Detail.path')}</h3>
                <p className={`${styles.text} ${styles.path}`}>{understanding.filePath}</p>
              </section>
            ) : null}

            {liveActivities.length > 0 ? (
              <section className={styles.section}>
                <h3 className={styles.sectionTitle}>{ts('map.liveGraph.currentActivity')}</h3>
                <ul className={styles.list}>
                  {liveActivities
                    .slice()
                    .reverse()
                    .slice(0, 4)
                    .map((activity) => (
                      <li key={activity.id}>
                        {activity.agentId
                          ? `${ts('map.liveGraph.agentLabel', { agent: activity.agentId })} · `
                          : ''}
                        {ts(`map.liveGraph.kind.${activity.kind}`)} · {activity.label} ·{' '}
                        {ts(`map.liveGraph.status.${activity.status === 'error' ? 'error' : activity.status === 'running' ? 'running' : 'complete'}`)}
                      </li>
                    ))}
                </ul>
              </section>
            ) : null}

            {verificationNarrative ? (
              <section className={styles.section}>
                <h3 className={styles.sectionTitle}>{ts('map.liveGraph.verificationTitle')}</h3>
                <p className={styles.text}>
                  {ts(
                    `map.liveGraph.status.${
                      verificationNarrative.status === 'failed'
                        ? 'error'
                        : verificationNarrative.status === 'passed'
                          ? 'complete'
                          : 'running'
                    }`,
                  )}
                  {verificationNarrative.reason
                    ? ` · ${ts('map.liveGraph.verificationReason', {
                        reason: verificationNarrative.reason,
                      })}`
                    : ''}
                </p>
                {verificationNarrative.command ? (
                  <p className={styles.text}>
                    {ts('map.liveGraph.verificationCommand', {
                      command: verificationNarrative.command,
                    })}
                  </p>
                ) : null}
                {verificationNarrative.summary ? (
                  <p className={styles.text}>{verificationNarrative.summary}</p>
                ) : null}
                {verificationNarrative.suggestedTests.length > 0 ? (
                  <>
                    <h4 className={styles.sectionTitle}>{ts('map.liveGraph.verificationSuggested')}</h4>
                    <ul className={styles.list}>
                      {verificationNarrative.suggestedTests.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </>
                ) : null}
                {verificationNarrative.acceptanceCriteria.length > 0 ? (
                  <>
                    <h4 className={styles.sectionTitle}>{ts('map.liveGraph.verificationCriteria')}</h4>
                    <ul className={styles.list}>
                      {verificationNarrative.acceptanceCriteria.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </>
                ) : null}
                {verificationNarrative.unexpectedPaths.length > 0 ? (
                  <>
                    <h4 className={styles.sectionTitle}>{ts('map.liveGraph.verificationUnexpected')}</h4>
                    <ul className={styles.list}>
                      {verificationNarrative.unexpectedPaths.map((item) => (
                        <li key={item} className={styles.path}>
                          {item}
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}
              </section>
            ) : null}

            {taskIds.length > 0 ? (
              <section className={styles.section}>
                <h3 className={styles.sectionTitle}>{ts('map.liveGraph.focusTask')}</h3>
                <div className={styles.actionRow}>
                  {taskIds.map((taskId) => (
                    <button
                      key={taskId}
                      type="button"
                      className={`${styles.actionButton} tech-focus`}
                      onClick={() =>
                        setLiveGraphFocusTask(
                          liveGraphFocusTaskId === taskId ? null : taskId,
                        )
                      }
                    >
                      {liveGraphFocusTaskId === taskId
                        ? ts('map.liveGraph.clearFocus')
                        : ts('map.liveGraph.focusTaskNamed', { task: taskId })}
                    </button>
                  ))}
                </div>
              </section>
            ) : null}

            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>{ts('map.c4Detail.description')}</h3>
              {llmLoading ? (
                <p className={styles.empty} data-testid="c4-detail-understanding-loading">
                  {ts('map.c4Detail.understandingLoading')}
                </p>
              ) : descriptionText ? (
                <p className={styles.text}>{descriptionText}</p>
              ) : (
                <p className={styles.empty}>
                  {llmError
                    ? ts('map.c4Detail.understandingFailed')
                    : ts('map.c4Detail.descriptionEmpty')}
                </p>
              )}
            </section>

            {understanding.isCodeNode ? (
              <section className={styles.section}>
                <h3 className={styles.sectionTitle}>{ts('map.c4Detail.role')}</h3>
                {llmLoading ? (
                  <p className={styles.empty}>{ts('map.c4Detail.understandingLoading')}</p>
                ) : roleText ? (
                  <p className={styles.text}>{roleText}</p>
                ) : (
                  <p className={styles.empty}>
                    {llmError
                      ? ts('map.c4Detail.understandingFailed')
                      : ts('map.c4Detail.roleEmpty')}
                  </p>
                )}
              </section>
            ) : detail.responsibility ? (
              <section className={styles.section}>
                <h3 className={styles.sectionTitle}>{ts('map.c4Detail.responsibility')}</h3>
                <p className={styles.text}>{detail.responsibility}</p>
              </section>
            ) : null}

            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>{ts('map.c4Detail.changeRisk')}</h3>
              <p className={`${styles.text} ${riskClass(understanding.changeRisk)}`}>
                {ts(`map.c4Detail.risk.${understanding.changeRisk}`)}
                {' · '}
                {ts('map.c4Detail.impactSummary', {
                  dependents: String(understanding.impactDependentCount),
                  dependencies: String(understanding.impactDependencyCount),
                })}
              </p>
            </section>

            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>{ts('map.c4Detail.confidence')}</h3>
              <p className={styles.text}>{confidenceLabel(node.confidence)}</p>
            </section>

            {node.sourceKind ? (
              <section className={styles.section}>
                <h3 className={styles.sectionTitle}>{ts('map.c4Detail.sourceKind')}</h3>
                <p className={styles.text}>{node.sourceKind}</p>
              </section>
            ) : null}

            {node.owners && node.owners.length > 0 ? (
              <section className={styles.section}>
                <h3 className={styles.sectionTitle}>{ts('map.c4Detail.owners')}</h3>
                <ul className={styles.list}>
                  {node.owners.map((owner) => (
                    <li key={owner}>{owner}</li>
                  ))}
                </ul>
              </section>
            ) : null}

            {node.notes ? (
              <section className={styles.section}>
                <h3 className={styles.sectionTitle}>{ts('map.c4Detail.notes')}</h3>
                <p className={styles.text}>{node.notes}</p>
              </section>
            ) : null}

            {node.openQuestions && node.openQuestions.length > 0 ? (
              <section className={styles.section}>
                <h3 className={styles.sectionTitle}>{ts('map.c4Detail.openQuestions')}</h3>
                <ul className={styles.list}>
                  {node.openQuestions.map((question) => (
                    <li key={question}>{question}</li>
                  ))}
                </ul>
              </section>
            ) : null}
          </>
        ) : null}

        {tab === 'diff' ? (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>{ts('map.c4Detail.diffTitle')}</h3>
            {editedPaths.length === 0 ? (
              <p className={styles.empty}>{ts('map.c4Detail.diffEmpty')}</p>
            ) : (
              <ul className={styles.actionList}>
                {editedPaths.map((path) => (
                  <li key={path}>
                    <span className={styles.path}>{path}</span>
                    <button
                      type="button"
                      className={`${styles.actionButton} tech-focus`}
                      onClick={() => void navigateToDiffReviewFile(path)}
                    >
                      {ts('map.c4Detail.openDiff')}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {understanding.filePath && editedPaths.length === 0 ? (
              <button
                type="button"
                className={`${styles.actionButton} tech-focus`}
                onClick={() => void navigateToDiffReviewFile(understanding.filePath!)}
              >
                {ts('map.c4Detail.openDiff')}
              </button>
            ) : null}
          </section>
        ) : null}

        {tab === 'activity' ? (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>{ts('map.c4Detail.activityTitle')}</h3>
            {liveActivities.length === 0 ? (
              <p className={styles.empty}>{ts('map.c4Detail.activityEmpty')}</p>
            ) : (
              <ul className={styles.actionList}>
                {liveActivities.map((activity) => (
                  <li key={activity.id}>
                    <div className={styles.activityMeta}>
                      <strong>
                        {activity.agentId
                          ? `${ts('map.liveGraph.agentLabel', { agent: activity.agentId })} · `
                          : ''}
                        {ts(`map.liveGraph.kind.${activity.kind}`)} · {activity.label}
                      </strong>
                      <span>
                        {ts(
                          `map.liveGraph.status.${
                            activity.status === 'error'
                              ? 'error'
                              : activity.status === 'running'
                                ? 'running'
                                : 'complete'
                          }`,
                        )}
                        {activity.taskId ? ` · ${activity.taskId}` : ''}
                        {activity.runId ? ` · ${activity.runId.slice(0, 8)}` : ''}
                      </span>
                    </div>
                    <button
                      type="button"
                      className={`${styles.actionButton} tech-focus`}
                      onClick={() =>
                        openActivityInAgentFlow(agentFlowActivityIdsForLive(activity))
                      }
                    >
                      {ts('map.c4Detail.openInAgentFlow')}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}

        {tab === 'relations' ? (
          <>
            {understanding.usedBy.length > 0 ? (
              <section className={styles.section}>
                <h3 className={styles.sectionTitle}>{usedByTitle}</h3>
                <ul className={styles.list}>
                  {understanding.usedBy.map((item) => (
                    <li key={`used-${item.id}`}>{item.label}</li>
                  ))}
                </ul>
              </section>
            ) : null}

            {understanding.dependsOn.length > 0 ? (
              <section className={styles.section}>
                <h3 className={styles.sectionTitle}>{dependsOnTitle}</h3>
                <ul className={styles.list}>
                  {understanding.dependsOn.map((item) => (
                    <li key={`dep-${item.id}`}>{item.label}</li>
                  ))}
                </ul>
              </section>
            ) : null}

            {touchedPaths.length > 0 ? (
              <section className={styles.section}>
                <h3 className={styles.sectionTitle}>{ts('map.c4Detail.taskTouched')}</h3>
                <ul className={styles.list}>
                  {touchedPaths.map((path) => (
                    <li key={path} className={styles.path}>
                      {path}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {!understanding.isCodeNode && understanding.impactViews.length > 0 ? (
              <section className={styles.section}>
                <h3 className={styles.sectionTitle}>{ts('map.c4Detail.impactViews')}</h3>
                <ul className={styles.list}>
                  {understanding.impactViews.map((viewKey) => (
                    <li key={viewKey}>{viewKey}</li>
                  ))}
                </ul>
              </section>
            ) : null}

            {!understanding.isCodeNode && linked.length > 0 ? (
              <section className={styles.section}>
                <h3 className={styles.sectionTitle}>{ts('map.c4Detail.linkedFiles')}</h3>
                <ul className={styles.list}>
                  {linked.map((file) => (
                    <li key={file.path} className={styles.path}>
                      {file.path}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {understanding.usedBy.length === 0 &&
            understanding.dependsOn.length === 0 &&
            touchedPaths.length === 0 &&
            linked.length === 0 ? (
              <p className={styles.empty}>{ts('map.c4Detail.relationsEmpty')}</p>
            ) : null}
          </>
        ) : null}

        {tab === 'controls' ? (
          <>
            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>{ts('map.liveGraph.controlsContext')}</h3>
              <p className={styles.empty}>{ts('map.liveGraph.controlsContextHint')}</p>
              <div className={styles.actionRow}>
                <button
                  type="button"
                  className={`${styles.actionButton} tech-focus`}
                  onClick={() => addGraphContextFromNode(node.id)}
                >
                  {ts('map.liveGraph.addContext')}
                </button>
              </div>
            </section>

            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>{ts('map.liveGraph.controlsInstruction')}</h3>
              <textarea
                className={styles.instructionInput}
                rows={3}
                value={instruction}
                onChange={(event) => setInstruction(event.target.value)}
                placeholder={ts('map.liveGraph.instructionPlaceholder')}
                aria-label={ts('map.liveGraph.controlsInstruction')}
              />
              <div className={styles.actionRow}>
                <button
                  type="button"
                  className={`${styles.actionButton} tech-focus`}
                  disabled={!instruction.trim()}
                  onClick={() => {
                    sendGraphInstructionFromNode(node.id, instruction)
                    setInstruction('')
                  }}
                >
                  {ts('map.liveGraph.sendInstruction')}
                </button>
              </div>
            </section>

            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>{ts('map.liveGraph.controlsRun')}</h3>
              <div className={styles.actionRow}>
                {flowStatus === 'running' ? (
                  <button
                    type="button"
                    className={`${styles.actionButton} tech-focus`}
                    onClick={() => void pauseAgentFromGraph()}
                  >
                    {ts('map.liveGraph.pause')}
                  </button>
                ) : null}
                {liveGraphPausedRunId ? (
                  <button
                    type="button"
                    className={`${styles.actionButton} tech-focus`}
                    onClick={() => void resumeAgentFromGraph()}
                  >
                    {ts('map.liveGraph.resume')}
                  </button>
                ) : null}
                {flowStatus !== 'running' && !liveGraphPausedRunId ? (
                  <p className={styles.empty}>{ts('map.liveGraph.noActiveRun')}</p>
                ) : null}
              </div>
            </section>

            {needsApproval ? (
              <section className={styles.section} data-testid="live-graph-approval">
                <h3 className={styles.sectionTitle}>{ts('map.liveGraph.controlsApproval')}</h3>
                <p className={styles.empty}>{ts('map.liveGraph.approvalHint')}</p>
                <div className={styles.actionRow}>
                  <button
                    type="button"
                    className={`${styles.actionButton} tech-focus`}
                    onClick={() => void approveFromGraph()}
                    disabled={verificationCommandApproval?.status !== 'approval_required'}
                  >
                    {ts('map.liveGraph.approve')}
                  </button>
                  <button
                    type="button"
                    className={`${styles.actionButton} tech-focus`}
                    onClick={() => rejectFromGraph()}
                    disabled={verificationCommandApproval?.status !== 'approval_required'}
                  >
                    {ts('map.liveGraph.reject')}
                  </button>
                </div>
              </section>
            ) : null}
          </>
        ) : null}
      </div>
    </aside>
  )
}
