import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
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
  listNodeChangeEntries,
  listTouchedPathsForNode,
} from '../../../../services/live-graph/index.js'
import { useI18n } from '../../i18n'
import { useChatSessionStore } from '../../state/chatSessionStore'
import { useWorkbenchStore } from '../../state/workbenchStore'
import { useComposePromptVoice } from '../ChatPanel/composer/useComposePromptVoice'
import {
  VoiceInputDock,
  VoiceInputErrorBanner,
} from '../ChatPanel/VoiceInputControls'
import Button from '../ui/Button'
import Chip from '../ui/Chip'
import TabBar from '../ui/TabBar'
import CompletedAgentActivityStack from './CompletedAgentActivityStack'
import CompletedChangesStack from './CompletedChangesStack'
import { isTrivialCodeDescription } from './codeFileDescription'
import {
  buildNodeUnderstanding,
  type ChangeRiskLevel,
} from './codeFileUnderstanding'
import { codeNodeDisplayTitle, codeNodeFilePath, isCodeElementNode } from './codeNodeInteraction'
import NodeLiveActivityCard from './NodeLiveActivityCard'
import NodeLiveChangeCard from './NodeLiveChangeCard'
import { nodeDetailCopy } from './nodeCopy'
import {
  partitionNodeActivities,
  partitionNodeChanges,
} from './partitionNodeActivities'
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
  /** `sidebar` fills the Function Map left panel; `overlay` is the legacy floating card. */
  layout?: 'overlay' | 'sidebar'
}

/** Inspect = static node facts; Live = run-time activity + diffs. Controls sit in a sticky footer. */
type DetailTab = 'inspect' | 'live'

function confidenceLabel(confidence: number): string {
  return `${Math.round(Math.max(0, Math.min(1, confidence)) * 100)}%`
}

function riskClass(risk: ChangeRiskLevel): string {
  if (risk === 'high') return styles.riskHigh
  if (risk === 'medium') return styles.riskMedium
  return styles.riskLow
}

function activityStatusClass(
  status: string,
): string {
  if (status === 'error') return styles.statusError
  if (status === 'running') return styles.statusRunning
  return styles.statusComplete
}

export default function C4NodeDetailDrawer({
  node,
  layerNodes,
  layerEdges,
  fileIndex,
  fileRelations,
  durableGraph,
  onClose,
  layout = 'overlay',
}: Props) {
  const { ts, locale } = useI18n()
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
  const [tab, setTab] = useState<DetailTab>('inspect')
  const [instruction, setInstruction] = useState('')
  const [completedStackExpanded, setCompletedStackExpanded] = useState(false)
  const [changesStackExpanded, setChangesStackExpanded] = useState(false)
  const instructionRef = useRef(instruction)
  instructionRef.current = instruction
  const nodeIdRef = useRef(node?.id)
  nodeIdRef.current = node?.id

  const composeVoice = useComposePromptVoice({
    locale,
    disabled: !node,
    getText: () => instructionRef.current,
    setText: setInstruction,
    onSubmit: (text) => {
      const nodeId = nodeIdRef.current
      if (!nodeId || !text.trim()) return
      sendGraphInstructionFromNode(nodeId, text)
      setInstruction('')
    },
  })

  const isCodeNode = node ? isCodeElementNode(node) : false
  const filePath = node && isCodeNode ? codeNodeFilePath(node) : null

  const liveActivities = useMemo(
    () => (node ? listNodeActivities(executionOverlay, node.id) : []),
    [executionOverlay, node],
  )
  const { active: activeActivities, completed: completedActivities } = useMemo(
    () => partitionNodeActivities(liveActivities),
    [liveActivities],
  )
  const changeEntries = useMemo(
    () => (node ? listNodeChangeEntries(executionOverlay, node.id) : []),
    [executionOverlay, node],
  )
  const { active: activeChanges, completed: completedChanges } = useMemo(
    () => partitionNodeChanges(changeEntries),
    [changeEntries],
  )
  const editedPaths = useMemo(
    () => changeEntries.map((entry) => entry.path),
    [changeEntries],
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
  const liveSignalCount = liveActivities.length + editedPaths.length
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

  useEffect(() => {
    setInstruction('')
    setCompletedStackExpanded(false)
    setChangesStackExpanded(false)
    const hasLive =
      Boolean(node) &&
      (listNodeActivities(executionOverlay, node!.id).length > 0 ||
        listEditedPathsForNode(executionOverlay, node!.id).length > 0)
    setTab(hasLive ? 'live' : 'inspect')
    // Only re-pick default tab when the selected node changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: node id gate
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

  const metaLine = [node.elementType, node.level, node.technology]
    .filter(Boolean)
    .join(' · ')

  return (
    <aside
      className={`${styles.drawer} ${layout === 'sidebar' ? styles.drawerSidebar : ''}`}
      aria-label={ts('map.c4Detail.title')}
      data-testid="c4-node-detail-drawer"
      data-layout={layout}
    >
      <header className={styles.header}>
        <div className={styles.heading}>
          <h2 className={styles.title}>{title}</h2>
          {metaLine ? <p className={styles.meta}>{metaLine}</p> : null}
          {understanding.stereotype || understanding.fileType ? (
            <div className={styles.chips}>
              {understanding.stereotype ? (
                <Chip asButton={false}>{understanding.stereotype}</Chip>
              ) : null}
              {understanding.fileType ? (
                <Chip asButton={false}>{ts(`map.fileTypes.${understanding.fileType}`)}</Chip>
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

      <div className={styles.tabRail}>
        <TabBar
          size="sm"
          chrome="nested"
          activeId={tab}
          onChange={(id) => setTab(id as DetailTab)}
          tabs={[
            { id: 'inspect', label: ts('map.c4Detail.tabs.inspect') },
            {
              id: 'live',
              label: ts('map.c4Detail.tabs.live'),
              badge:
                liveSignalCount > 0 ? (
                  <span className={styles.tabBadge}>{liveSignalCount}</span>
                ) : undefined,
            },
          ]}
        />
      </div>

      <div className={styles.body}>
        {tab === 'inspect' ? (
          <>
            {understanding.filePath ? (
              <section className={styles.section}>
                <h3 className={styles.sectionTitle}>{ts('map.c4Detail.path')}</h3>
                <p className={styles.pathBlock}>{understanding.filePath}</p>
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
              <div className={styles.factGrid}>
                <div className={styles.fact}>
                  <span className={styles.factLabel}>{ts('map.c4Detail.changeRisk')}</span>
                  <p className={`${styles.factValue} ${riskClass(understanding.changeRisk)}`}>
                    {ts(`map.c4Detail.risk.${understanding.changeRisk}`)}
                  </p>
                  <p className={styles.factHint}>
                    {ts('map.c4Detail.impactSummary', {
                      dependents: String(understanding.impactDependentCount),
                      dependencies: String(understanding.impactDependencyCount),
                    })}
                  </p>
                </div>
                <div className={styles.fact}>
                  <span className={styles.factLabel}>{ts('map.c4Detail.confidence')}</span>
                  <p className={styles.factValue}>{confidenceLabel(node.confidence)}</p>
                  {node.sourceKind ? (
                    <p className={styles.factHint}>{node.sourceKind}</p>
                  ) : null}
                </div>
              </div>
            </section>

            {understanding.usedBy.length > 0 ? (
              <section className={styles.section}>
                <h3 className={styles.sectionTitle}>{usedByTitle}</h3>
                <ul className={styles.softList}>
                  {understanding.usedBy.map((item) => (
                    <li key={`used-${item.id}`} className={styles.softItem}>
                      {item.label}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {understanding.dependsOn.length > 0 ? (
              <section className={styles.section}>
                <h3 className={styles.sectionTitle}>{dependsOnTitle}</h3>
                <ul className={styles.softList}>
                  {understanding.dependsOn.map((item) => (
                    <li key={`dep-${item.id}`} className={styles.softItem}>
                      {item.label}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {touchedPaths.length > 0 ? (
              <section className={styles.section}>
                <h3 className={styles.sectionTitle}>{ts('map.c4Detail.taskTouched')}</h3>
                <ul className={styles.softList}>
                  {touchedPaths.map((path) => (
                    <li
                      key={path}
                      className={`${styles.softItem} ${styles.softItemMono}`}
                    >
                      {path}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {!understanding.isCodeNode && understanding.impactViews.length > 0 ? (
              <section className={styles.section}>
                <h3 className={styles.sectionTitle}>{ts('map.c4Detail.impactViews')}</h3>
                <ul className={styles.softList}>
                  {understanding.impactViews.map((viewKey) => (
                    <li key={viewKey} className={styles.softItem}>
                      {viewKey}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {!understanding.isCodeNode && linked.length > 0 ? (
              <section className={styles.section}>
                <h3 className={styles.sectionTitle}>{ts('map.c4Detail.linkedFiles')}</h3>
                <ul className={styles.softList}>
                  {linked.map((file) => (
                    <li
                      key={file.path}
                      className={`${styles.softItem} ${styles.softItemMono}`}
                    >
                      {file.path}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {node.owners && node.owners.length > 0 ? (
              <section className={styles.section}>
                <h3 className={styles.sectionTitle}>{ts('map.c4Detail.owners')}</h3>
                <ul className={styles.softList}>
                  {node.owners.map((owner) => (
                    <li key={owner} className={styles.softItem}>
                      {owner}
                    </li>
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
                <ul className={styles.softList}>
                  {node.openQuestions.map((question) => (
                    <li key={question} className={styles.softItem}>
                      {question}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </>
        ) : null}

        {tab === 'live' ? (
          <>
            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>{ts('map.c4Detail.activityTitle')}</h3>
              {liveActivities.length === 0 ? (
                <p className={styles.empty}>{ts('map.c4Detail.activityEmpty')}</p>
              ) : (
                <div className={styles.activityFeed}>
                  <CompletedAgentActivityStack
                    activities={completedActivities}
                    expanded={completedStackExpanded}
                    onToggle={() => setCompletedStackExpanded((open) => !open)}
                    onOpenInAgentFlow={(activity) =>
                      openActivityInAgentFlow(agentFlowActivityIdsForLive(activity))
                    }
                    statusClass={activityStatusClass}
                  />
                  {activeActivities.length > 0 ? (
                    <ul className={styles.actionList}>
                      {activeActivities.map((activity) => (
                        <NodeLiveActivityCard
                          key={activity.id}
                          activity={activity}
                          onOpenInAgentFlow={(item) =>
                            openActivityInAgentFlow(agentFlowActivityIdsForLive(item))
                          }
                          statusClass={activityStatusClass}
                        />
                      ))}
                    </ul>
                  ) : null}
                </div>
              )}
            </section>

            {verificationNarrative ? (
              <section className={styles.section}>
                <h3 className={styles.sectionTitle}>{ts('map.liveGraph.verificationTitle')}</h3>
                <div className={styles.actionCard}>
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
                    <p className={`${styles.text} ${styles.path}`}>
                      {ts('map.liveGraph.verificationCommand', {
                        command: verificationNarrative.command,
                      })}
                    </p>
                  ) : null}
                  {verificationNarrative.summary ? (
                    <p className={styles.text}>{verificationNarrative.summary}</p>
                  ) : null}
                </div>
                {verificationNarrative.suggestedTests.length > 0 ? (
                  <>
                    <h4 className={styles.sectionTitle}>{ts('map.liveGraph.verificationSuggested')}</h4>
                    <ul className={styles.softList}>
                      {verificationNarrative.suggestedTests.map((item) => (
                        <li key={item} className={styles.softItem}>
                          {item}
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}
                {verificationNarrative.acceptanceCriteria.length > 0 ? (
                  <>
                    <h4 className={styles.sectionTitle}>{ts('map.liveGraph.verificationCriteria')}</h4>
                    <ul className={styles.softList}>
                      {verificationNarrative.acceptanceCriteria.map((item) => (
                        <li key={item} className={styles.softItem}>
                          {item}
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}
                {verificationNarrative.unexpectedPaths.length > 0 ? (
                  <>
                    <h4 className={styles.sectionTitle}>{ts('map.liveGraph.verificationUnexpected')}</h4>
                    <ul className={styles.softList}>
                      {verificationNarrative.unexpectedPaths.map((item) => (
                        <li
                          key={item}
                          className={`${styles.softItem} ${styles.softItemMono}`}
                        >
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
                    <Button
                      key={taskId}
                      variant={liveGraphFocusTaskId === taskId ? 'primary' : 'secondary'}
                      size="sm"
                      onClick={() =>
                        setLiveGraphFocusTask(
                          liveGraphFocusTaskId === taskId ? null : taskId,
                        )
                      }
                    >
                      {liveGraphFocusTaskId === taskId
                        ? ts('map.liveGraph.clearFocus')
                        : ts('map.liveGraph.focusTaskNamed', { task: taskId })}
                    </Button>
                  ))}
                </div>
              </section>
            ) : null}

            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>{ts('map.c4Detail.diffTitle')}</h3>
              {changeEntries.length === 0 ? (
                <p className={styles.empty}>{ts('map.c4Detail.diffEmpty')}</p>
              ) : (
                <div className={styles.activityFeed}>
                  <CompletedChangesStack
                    changes={completedChanges}
                    expanded={changesStackExpanded}
                    onToggle={() => setChangesStackExpanded((open) => !open)}
                    onOpenDiff={(path) => void navigateToDiffReviewFile(path)}
                    statusClass={activityStatusClass}
                  />
                  {activeChanges.length > 0 ? (
                    <ul className={styles.actionList}>
                      {activeChanges.map((change) => (
                        <NodeLiveChangeCard
                          key={change.path}
                          change={change}
                          onOpenDiff={(path) => void navigateToDiffReviewFile(path)}
                          statusClass={activityStatusClass}
                        />
                      ))}
                    </ul>
                  ) : null}
                </div>
              )}
              {understanding.filePath && changeEntries.length === 0 ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void navigateToDiffReviewFile(understanding.filePath!)}
                >
                  {ts('map.c4Detail.openDiff')}
                </Button>
              ) : null}
            </section>
          </>
        ) : null}
      </div>

      <footer className={styles.controls} aria-label={ts('map.c4Detail.controlsLabel')}>
        {needsApproval ? (
          <div className={styles.approvalBanner} data-testid="live-graph-approval">
            <p className={styles.approvalTitle}>{ts('map.liveGraph.controlsApproval')}</p>
            <div className={styles.actionRowStretch}>
              <Button
                variant="primary"
                size="sm"
                onClick={() => void approveFromGraph()}
                disabled={verificationCommandApproval?.status !== 'approval_required'}
              >
                {ts('map.liveGraph.approve')}
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => rejectFromGraph()}
                disabled={verificationCommandApproval?.status !== 'approval_required'}
              >
                {ts('map.liveGraph.reject')}
              </Button>
            </div>
          </div>
        ) : null}

        <div className={styles.composer}>
          {composeVoice.voice.state.error ? (
            <VoiceInputErrorBanner
              errorKey={composeVoice.voice.state.error}
              onDismiss={composeVoice.voice.dismissError}
              labels={composeVoice.voiceLabels}
            />
          ) : null}
          <div className={styles.instructionWrap}>
            <textarea
              className={`tech-field ${styles.instructionInput}`}
              rows={3}
              value={instruction}
              onChange={(event) => {
                const value = event.target.value
                setInstruction(value)
                composeVoice.syncBaseFromExternalText(value)
              }}
              onKeyDown={(event: KeyboardEvent<HTMLTextAreaElement>) => {
                if (
                  event.key === 'Escape' &&
                  (composeVoice.voice.isRecording || composeVoice.voice.isTranscribing)
                ) {
                  event.preventDefault()
                  composeVoice.cancelVoice()
                  return
                }
                if (
                  (event.metaKey || event.ctrlKey) &&
                  event.shiftKey &&
                  event.code === 'Space'
                ) {
                  event.preventDefault()
                  composeVoice.dockProps.onMicToggle()
                }
              }}
              placeholder={ts('map.liveGraph.instructionPlaceholder')}
              aria-label={ts('map.liveGraph.controlsInstruction')}
            />
            <VoiceInputDock {...composeVoice.dockProps} />
          </div>
          <div className={styles.composerActions}>
            <div className={styles.actionRow}>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => addGraphContextFromNode(node.id)}
              >
                {ts('map.liveGraph.addContext')}
              </Button>
              {flowStatus === 'running' ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void pauseAgentFromGraph()}
                >
                  {ts('map.liveGraph.pause')}
                </Button>
              ) : null}
              {liveGraphPausedRunId ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void resumeAgentFromGraph()}
                >
                  {ts('map.liveGraph.resume')}
                </Button>
              ) : null}
            </div>
            <Button
              variant="primary"
              size="sm"
              disabled={!instruction.trim()}
              onClick={() => {
                if (composeVoice.voice.isRecording || composeVoice.voice.isTranscribing) {
                  composeVoice.stopVoice()
                }
                sendGraphInstructionFromNode(node.id, instruction)
                setInstruction('')
              }}
            >
              {ts('map.liveGraph.sendInstruction')}
            </Button>
          </div>
        </div>
      </footer>
    </aside>
  )
}
