import { useEffect, useMemo, useRef, useState } from 'react'
import { GitBranch } from 'lucide-react'
import { CustomModeIcon } from './customModeIcons'
import { canSubmitAgentPrompt, useWorkbenchStore } from '../../state/workbenchStore'
import { useChatSessionStore } from '../../state/chatSessionStore'
import {
  selectPendingChangesDrawerUndoMode,
  selectPendingChangesDrawerVisible,
} from '../../state/pendingChangesDrawer'
import PendingChangesDrawer from '../PendingChangesDrawer/PendingChangesDrawer'
import { useI18n } from '../../i18n'
import { modelProfileLabel } from '@contracts/index'
import PromptRefinementCard from './PromptRefinementCard'
import RequestIntentCard from './RequestIntentCard'
import PlanReviewCard from './PlanReviewCard'
import PendingRunDecisions from './PendingRunDecisions'
import AgentPoolAcceptanceCard from './AgentPoolAcceptanceCard'
import { useAgentPoolStore } from '../AgentFlow/AgentPool/agentPoolStore'
import DebugSessionPanel from './DebugSessionPanel'
import { cycleChatMode } from './ChatModeSelector'
import ChatMessageContent from './ChatMessageContent'
import ChatMessageCopyButton from './ChatMessageCopyButton'
import InheritedSessionCard from './InheritedSessionCard'
import ProductLabCard from '../ProductLab/ProductLabCard'
import { useProductLabStore } from '../../state/productLabStore'
import AgentActivityIndicator from '../ui/AgentActivityIndicator'
import AgentActivitySummaryRow from '../AgentFlow/AgentActivitySummaryRow'
import {
  activitiesForMessage,
  buildActivityLabels,
  liveActivities,
  projectAgentActivities,
} from '../AgentFlow/projectAgentActivities'
import { VoiceInputErrorBanner } from './VoiceInputControls'
import { mergeBaseWithSpoken } from './voice/mergeTranscript'
import { useChatVoiceBackend } from './voice/useChatVoiceBackend'
import { useLocalWhisperStatus } from './voice/useLocalWhisperStatus'
import { useVoiceInput } from './voice/useVoiceInput'
import PromptComposer from './composer/PromptComposer'
import { setComposerText } from './composer/composerTokens'
import AttachmentChips from './composer/AttachmentChips'
import {
  isSpatialPinSnapshotAttachment,
  parseSpatialPinChatContent,
} from './spatialPinChatDisplay'
import LoopAuthoringBanner from '../LoopGraph/LoopAuthoringBanner'
import DiagramSummaryCard from '../DiagramGraph/DiagramSummaryCard'
import { useDiagramGraphStore } from '../../state/diagramGraphStore'
import WireframePackSummaryCard from '../WireframePack/WireframePackSummaryCard'
import { useWireframePackStore } from '../../state/wireframePackStore'
import AgentDraftCard from '../AgentWorkforce/AgentDraftCard'
import { shouldSuggestPlanMode } from './suggestPlanMode'
import { isDebugFixPending } from '../../state/debugFixPending'
import ConversationNavRail from './ConversationNavRail'
import { collectUserTurns, scrollTurnIntoView } from './conversationNavTurns'
import FirstPrinciplesConflictCard from './FirstPrinciples/FirstPrinciplesConflictCard'
import FirstPrinciplesLayerCard from './FirstPrinciples/FirstPrinciplesLayerCard'
import FirstPrinciplesSuggestChip from './FirstPrinciples/FirstPrinciplesSuggestChip'
import ThesisHandoffBar from './FirstPrinciples/ThesisHandoffBar'
import ThesisReviewCard from './FirstPrinciples/ThesisReviewCard'
import { looksLikeVisionPrompt } from '@contracts/index'
import styles from './ChatPanel.module.css'

export default function ChatPanel() {
  const messages = useWorkbenchStore((s) => s.messages)
  const inheritedDigest = useChatSessionStore((s) => s.inheritedDigest)
  const activeSessionId = useChatSessionStore((s) => s.activeSessionId)
  const pendingRevealMessageId = useChatSessionStore((s) => s.pendingRevealMessageId)
  const clearPendingRevealMessage = useChatSessionStore((s) => s.clearPendingRevealMessage)
  const forkSession = useChatSessionStore((s) => s.forkSession)
  const composerDraft = useWorkbenchStore((s) => s.composerDraft)
  const setComposerDraft = useWorkbenchStore((s) => s.setComposerDraft)
  const setChatInput = useWorkbenchStore((s) => s.setChatInput)
  const sendPrompt = useWorkbenchStore((s) => s.sendPrompt)
  const pendingRefinement = useWorkbenchStore((s) => s.pendingRefinement)
  const pendingIntent = useWorkbenchStore((s) => s.pendingIntent)
  const settings = useWorkbenchStore((s) => s.settings)
  const executorOptions = useWorkbenchStore((s) => s.executorOptions)
  const approveRequestIntent = useWorkbenchStore((s) => s.approveRequestIntent)
  const reviseRequestIntent = useWorkbenchStore((s) => s.reviseRequestIntent)
  const pendingPlan = useWorkbenchStore((s) => s.pendingPlan)
  const activeChatSessionId = useChatSessionStore((s) => s.activeSessionId)
  const labChatSessionId = useProductLabStore((s) => {
    const id = s.document.activeSessionId
    if (!id) return null
    const session = s.document.sessions.find((entry) => entry.id === id)
    if (!session || session.status === 'ended') return null
    return session.chatSessionId ?? null
  })
  // Lab Card belongs only to the dedicated Lab chat session.
  const showLabCard = Boolean(
    labChatSessionId && labChatSessionId === activeChatSessionId,
  )
  const pendingDiagramSummary = useDiagramGraphStore((s) => s.pendingSummary)
  const pendingWireframeSummary = useWireframePackStore((s) => s.pendingSummary)
  const reviewingPoolTask = useAgentPoolStore((s) => s.reviewingTaskSnapshot)
  const runDecisions = useWorkbenchStore((s) => s.runDecisions)
  const focusedDecisionId = useWorkbenchStore((s) => s.focusedDecisionId)
  const decisionResolvingIds = useWorkbenchStore((s) => s.decisionResolvingIds)
  const resolveRunDecision = useWorkbenchStore((s) => s.resolveRunDecision)
  const planConfirmed = useWorkbenchStore((s) => s.planConfirmed)
  const debugSession = useWorkbenchStore((s) => s.debugSession)
  const refinementConfirmed = useWorkbenchStore((s) => s.refinementConfirmed)
  const confirmRefinement = useWorkbenchStore((s) => s.confirmRefinement)
  const confirmPlanBuild = useWorkbenchStore((s) => s.confirmPlanBuild)
  const submitPlanClarification = useWorkbenchStore((s) => s.submitPlanClarification)
  const revisePlan = useWorkbenchStore((s) => s.revisePlan)
  const savePlanEdits = useWorkbenchStore((s) => s.savePlanEdits)
  const savePlanToWorkspace = useWorkbenchStore((s) => s.savePlanToWorkspace)
  const returnToPlan = useWorkbenchStore((s) => s.returnToPlan)
  const lastBuiltPlan = useWorkbenchStore((s) => s.lastBuiltPlan)
  const activeCustomModeSkillId = useWorkbenchStore((s) => s.activeCustomModeSkillId)
  const setActiveCustomModeSkillId = useWorkbenchStore((s) => s.setActiveCustomModeSkillId)
  const exitCustomMode = useWorkbenchStore((s) => s.exitCustomMode)
  const createAgentComposerActive = useWorkbenchStore((s) => s.createAgentComposerActive)
  const pendingWorkforceDraft = useWorkbenchStore((s) => s.pendingWorkforceDraft)
  const updatePendingWorkforceDraft = useWorkbenchStore((s) => s.updatePendingWorkforceDraft)
  const confirmWorkforceDraft = useWorkbenchStore((s) => s.confirmWorkforceDraft)
  const dismissWorkforceDraft = useWorkbenchStore((s) => s.dismissWorkforceDraft)
  const cancelCreateAgentComposer = useWorkbenchStore((s) => s.cancelCreateAgentComposer)
  const [workforceDraftBusy, setWorkforceDraftBusy] = useState(false)
  const loadPlanFromWorkspace = useWorkbenchStore((s) => s.loadPlanFromWorkspace)
  const listWorkspacePlans = useWorkbenchStore((s) => s.listWorkspacePlans)
  const restoreConversationCheckpoint = useWorkbenchStore((s) => s.restoreConversationCheckpoint)
  const client = useWorkbenchStore((s) => s.client)
  const project = useWorkbenchStore((s) => s.project)
  const globalAgentActive = useWorkbenchStore((s) => s.globalAgentActive)
  const [suggestPlanDismissed, setSuggestPlanDismissed] = useState(false)
  const [customModeMeta, setCustomModeMeta] = useState<{
    name: string
    icon?: string
    color?: string
  } | null>(null)
  const [planSavingEdits, setPlanSavingEdits] = useState(false)
  const [workspacePlans, setWorkspacePlans] = useState<
    Array<{ id: string; objective: string; updatedAt?: string }>
  >([])
  const submitDebugRepro = useWorkbenchStore((s) => s.submitDebugRepro)
  const confirmDebugFix = useWorkbenchStore((s) => s.confirmDebugFix)
  const markDebugFixed = useWorkbenchStore((s) => s.markDebugFixed)
  const confirmBugAlignment = useWorkbenchStore((s) => s.confirmBugAlignment)
  const markBugFixed = useWorkbenchStore((s) => s.markBugFixed)
  const reviseRefinement = useWorkbenchStore((s) => s.reviseRefinement)
  const refineLoading = useWorkbenchStore((s) => s.refineLoading)
  const flowStatus = useWorkbenchStore((s) => s.flowStatus)
  const flowActions = useWorkbenchStore((s) => s.flowActions)
  const flowTransientTraces = useWorkbenchStore((s) => s.flowTransientTraces)
  const activeRunId = useWorkbenchStore((s) => s.activeRunId)
  const latestAskTrace = useWorkbenchStore((s) => s.latestAskTrace)
  const agentFlowSubject = useWorkbenchStore((s) => s.agentFlowSubject)
  const latestPlanTrace = useWorkbenchStore((s) => s.latestPlanTrace)
  const chatMode = useWorkbenchStore((s) => s.chatMode)
  const askSubMode = useWorkbenchStore((s) => s.askSubMode)
  const pendingFirstPrinciples = useWorkbenchStore((s) => s.pendingFirstPrinciples)
  const firstPrinciplesBusy = useWorkbenchStore((s) => s.firstPrinciplesBusy)
  const firstPrinciplesSuggestDismissed = useWorkbenchStore(
    (s) => s.firstPrinciplesSuggestDismissed,
  )
  const setAskSubMode = useWorkbenchStore((s) => s.setAskSubMode)
  const dismissFirstPrinciplesSuggest = useWorkbenchStore((s) => s.dismissFirstPrinciplesSuggest)
  const beginFirstPrinciplesFromVision = useWorkbenchStore((s) => s.beginFirstPrinciplesFromVision)
  const answerFirstPrinciplesQuestion = useWorkbenchStore((s) => s.answerFirstPrinciplesQuestion)
  const confirmFirstPrinciplesThesis = useWorkbenchStore((s) => s.confirmFirstPrinciplesThesis)
  const resolveFirstPrinciplesConflict = useWorkbenchStore((s) => s.resolveFirstPrinciplesConflict)
  const pivotFirstPrinciples = useWorkbenchStore((s) => s.pivotFirstPrinciples)
  const handoffFirstPrinciples = useWorkbenchStore((s) => s.handoffFirstPrinciples)
  const selectedNodeId = useWorkbenchStore((s) => s.selectedNodeId)
  const selectedFilePath = useWorkbenchStore((s) => s.selectedFilePath)
  const setChatMode = useWorkbenchStore((s) => s.setChatMode)
  const stopAgentRun = useWorkbenchStore((s) => s.stopAgentRun)
  const canSubmit = useWorkbenchStore(canSubmitAgentPrompt)
  const agentStopVisible = flowStatus === 'running' || refineLoading
  const locale = useWorkbenchStore((s) => s.locale)
  const diffFileStats = useWorkbenchStore((s) => s.diffFileStats)
  const pendingChangesDrawerExpanded = useWorkbenchStore((s) => s.pendingChangesDrawerExpanded)
  const setPendingChangesDrawerExpanded = useWorkbenchStore((s) => s.setPendingChangesDrawerExpanded)
  const navigateToDiffReviewFile = useWorkbenchStore((s) => s.navigateToDiffReviewFile)
  const undoAllPendingChanges = useWorkbenchStore((s) => s.undoAllPendingChanges)
  const undoLoading = useWorkbenchStore((s) => s.undoLoading)
  const pendingChangesDrawerVisible = useWorkbenchStore(selectPendingChangesDrawerVisible)
  const pendingChangesUndoMode = useWorkbenchStore(selectPendingChangesDrawerUndoMode)
  const { ts } = useI18n()
  const debugFixPending = isDebugFixPending(debugSession?.phase, flowStatus)
  // Cleaning up before the fix is applied strands it (it was prepared against the instrumented
  // file), so ask first; never refuse, or a person who does not want the fix keeps the probes.
  const requestDebugCleanup = () => {
    if (debugFixPending && !window.confirm(ts('debug.cleanupFixPendingConfirm'))) return
    void markDebugFixed()
  }
  const agentActivities = useMemo(() => projectAgentActivities({
    messages,
    latestAskTrace,
    latestPlanTrace,
    activeRunId,
    flowActions,
      flowTransientTraces,
      chatMode,
      flowSubject: agentFlowSubject,
      debugExploration: debugSession?.explorationTrace ?? null,
    }, buildActivityLabels(ts)), [
    messages,
    latestAskTrace,
    latestPlanTrace,
    agentFlowSubject,
    activeRunId,
    flowActions,
    flowTransientTraces,
    chatMode,
    debugSession,
    ts,
  ])
  const openActivity = (id: string) => {
    useWorkbenchStore.getState().setSelectedActivityId(id)
    useChatSessionStore.getState().presentAgentFlow()
  }
  const unanchoredActivities = liveActivities(agentActivities)
  const planActivityRows = unanchoredActivities.filter((activity) => activity.mode === 'plan')
  const debugActivityRows = unanchoredActivities.filter((activity) => activity.mode === 'debug')
  const runActivityRows = unanchoredActivities.filter(
    (activity) => activity.mode !== 'plan' && activity.mode !== 'debug',
  )
  const panelRef = useRef<HTMLDivElement>(null)
  const messagesRef = useRef<HTMLDivElement>(null)
  const baseInputRef = useRef('')
  const voiceUpdatingRef = useRef(false)
  const voiceBackend = useChatVoiceBackend(locale)
  const navTurns = useMemo(
    () => collectUserTurns(messages, agentActivities),
    [messages, agentActivities],
  )

  const chatModeNavLabel = useMemo(() => {
    switch (chatMode) {
      case 'ask':
        return ts('chat.askMode')
      case 'change':
        return ts('chat.changeMode')
      case 'plan':
        return ts('chat.planMode')
      case 'debug':
        return ts('chat.debugMode')
      case 'anchored':
        return ts('chat.anchoredMode')
      default:
        return undefined
    }
  }, [chatMode, ts])

  const applyVoiceText = (spoken: string, commit = false) => {
    const merged = mergeBaseWithSpoken(baseInputRef.current, spoken)
    if (commit) baseInputRef.current = merged
    voiceUpdatingRef.current = true
    setChatInput(merged)
    requestAnimationFrame(() => {
      voiceUpdatingRef.current = false
    })
    return merged
  }

  const voice = useVoiceInput({
    language: voiceBackend.language,
    submitKeywords: voiceBackend.submitKeywords,
    engine: voiceBackend.engine,
    transcribeBlob: voiceBackend.transcribeBlob,
    disabled: refineLoading,
    onPartial: applyVoiceText,
    onFinal: (spoken) => {
      applyVoiceText(spoken, true)
    },
    onSubmitKeyword: (spoken) => {
      const merged = applyVoiceText(spoken, true)
      const state = useWorkbenchStore.getState()
      if (merged.trim() && canSubmitAgentPrompt(state)) {
        void state.sendPrompt(state.composerDraft)
      }
    },
  })

  const {
    cancel: cancelVoice,
    isRecording,
    isTranscribing,
    stop: stopVoice,
    toggle: toggleVoice,
    dismissError,
    isSupported,
    state: voiceState,
  } = voice
  const whisperStatus = useLocalWhisperStatus()

  const voiceLabels = {
    start: ts('chat.voice.start'),
    stop: ts('chat.voice.stop'),
    recording: ts('chat.voice.recording'),
    notSupported: ts('chat.voice.notSupported'),
    permissionDenied: ts('chat.voice.permissionDenied'),
    serviceUnavailable: ts('chat.voice.serviceUnavailable'),
    transcriptionFailed: ts('chat.voice.transcriptionFailed'),
    missingApiKey: ts('chat.voice.missingApiKey'),
    missingModelProfile: ts('chat.voice.missingModelProfile'),
    unsupportedModel: ts('chat.voice.unsupportedModel'),
    modelDownloadFailed: ts('chat.voice.modelDownloadFailed'),
    modelLoadFailed: ts('chat.voice.modelLoadFailed'),
    noSpeech: ts('chat.voice.noSpeech'),
    unknown: ts('chat.voice.unknown'),
  }

  const voiceBusyLabel =
    whisperStatus.phase === 'loading'
      ? `${ts('chat.voice.loadingModel')} ${Math.round(whisperStatus.progress * 100)}%`
      : ts('chat.voice.transcribing')

  useEffect(() => {
    const el = messagesRef.current
    if (!el) return
    if (pendingRevealMessageId) return
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [messages, pendingRefinement, pendingIntent, pendingPlan, debugSession, refineLoading, pendingRevealMessageId])

  useEffect(() => {
    if (!pendingRevealMessageId) return
    const el = messagesRef.current
    if (!el) return
    const messageId = pendingRevealMessageId
    const frame = window.requestAnimationFrame(() => {
      const found = scrollTurnIntoView(el, messageId)
      clearPendingRevealMessage()
      if (!found) {
        el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
      }
    })
    return () => window.cancelAnimationFrame(frame)
  }, [pendingRevealMessageId, messages, clearPendingRevealMessage, activeSessionId])

  useEffect(() => {
    if (!isRecording && !isTranscribing) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setComposerDraft(setComposerText(composerDraft, baseInputRef.current))
      cancelVoice()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [cancelVoice, composerDraft, isRecording, isTranscribing, setComposerDraft])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (isRecording || isTranscribing) stopVoice()
    if (createAgentComposerActive) {
      if (composerDraft.text.trim()) void sendPrompt(composerDraft)
      return
    }
    if (composerDraft.text.trim() && canSubmit) void sendPrompt(composerDraft)
  }

  const handleVoiceToggle = () => {
    if (!isRecording) {
      baseInputRef.current = composerDraft.text
      toggleVoice()
      return
    }
    stopVoice()
  }

  const handleRevise = () => {
    reviseRefinement()
  }

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })

  useEffect(() => {
    if (!activeCustomModeSkillId || !client || !project) {
      setCustomModeMeta(null)
      return
    }
    let cancelled = false
    void client.listSkills(project.projectId).then((result) => {
      if (cancelled) return
      const skill = result.skills.find((item) => item.id === activeCustomModeSkillId)
      setCustomModeMeta({
        name: skill?.name ?? activeCustomModeSkillId,
        ...(skill?.icon ? { icon: skill.icon } : {}),
        ...(skill?.color ? { color: skill.color } : {}),
      })
    })
    return () => {
      cancelled = true
    }
  }, [activeCustomModeSkillId, client, project])

  const showGlobalAgentHint =
    (globalAgentActive || (!selectedNodeId && !selectedFilePath)) &&
    (chatMode === 'change' || chatMode === 'plan')
  const pendingIntentRuntimeId =
    pendingIntent?.executorSelection.kind === 'runtime' ? pendingIntent.executorSelection.runtimeProfileId : null
  const pendingIntentExecutorLabel = (() => {
    if (!pendingIntent) return ''
    const snapshot = pendingIntent.executorSnapshot
    if (snapshot) return snapshot.profile.displayName ?? snapshot.profile.name
    const selection = pendingIntent.executorSelection
    if (selection.kind === 'runtime') {
      return executorOptions.find((option) => option.executorId === selection.runtimeProfileId)?.label ??
        selection.runtimeProfileId
    }
    return settings?.modelProfiles.find((profile) => profile.id === selection.modelProfileId)?.name ??
      selection.modelProfileId
  })()

  return (
    <div className={styles.panel} ref={panelRef}>
      <div className={styles.messagesShell}>
        <div className={styles.messages} ref={messagesRef}>
        {showGlobalAgentHint ? (
          <div className={styles.suggestPlanBanner}>{ts('context.globalAgentEmptyHint')}</div>
        ) : null}
        {inheritedDigest ? <InheritedSessionCard digest={inheritedDigest} /> : null}
        {showLabCard ? <ProductLabCard /> : null}
        <PendingRunDecisions
          decisions={runDecisions}
          resolvingIds={decisionResolvingIds}
          focusedDecisionId={focusedDecisionId}
          onResolve={(decision, optionId, text, status) =>
            void resolveRunDecision(decision, optionId, text, status)}
        />
        {messages.map((msg) => {
          const spatialPin = msg.role === 'user' && parseSpatialPinChatContent(msg.content)
          const attachments = spatialPin
            ? (msg.attachments ?? []).filter((item) => !isSpatialPinSnapshotAttachment(item))
            : (msg.attachments ?? [])
          const showCopy =
            chatMode === 'ask' && msg.role === 'assistant' && msg.content.trim().length > 0
          const showBranch =
            !!activeSessionId &&
            (msg.role === 'user' || msg.role === 'assistant') &&
            msg.content.trim().length > 0
          const canAnchor =
            (msg.role === 'user' || msg.role === 'assistant') && msg.content.trim().length > 0
          return (
            <div
              key={msg.id}
              className={`${styles.message} ${styles[msg.role]}`}
              {...(canAnchor ? { 'data-message-id': msg.id } : {})}
            >
              <div className={styles.messageBody}>
                {msg.role === 'user' && (attachments.length || msg.invokedSkillId) ? (
                  <AttachmentChips
                    attachments={attachments}
                    invokedSkillLabel={msg.invokedSkillId}
                    onRemove={() => {
                      /* message history chips are read-only */
                    }}
                  />
                ) : null}
                <div className={styles.bubble} title={formatTime(msg.timestamp)}>
                  {activitiesForMessage(agentActivities, msg.id).map((activity) => (
                    <AgentActivitySummaryRow
                      key={activity.id}
                      id={activity.id}
                      status={activity.status}
                      summary={activity.summary}
                      onOpen={() => openActivity(activity.id)}
                    />
                  ))}
                  <ChatMessageContent message={msg} />
                </div>
                {(showCopy || showBranch || msg.checkpointId) && (
                  <div className={styles.messageActions}>
                    {msg.checkpointId ? (
                      <button
                        type="button"
                        className={styles.copyButton}
                        onClick={() => void restoreConversationCheckpoint(msg.checkpointId!)}
                      >
                        {ts('chat.restoreCheckpoint')}
                      </button>
                    ) : null}
                    {showBranch ? (
                      <button
                        type="button"
                        className={styles.copyButton}
                        aria-label={ts('chat.sessionGraph.branchFromHere')}
                        title={ts('chat.sessionGraph.branchFromHere')}
                        onClick={() => void forkSession(activeSessionId!, msg.id)}
                      >
                        <GitBranch size={14} aria-hidden />
                      </button>
                    ) : null}
                    {showCopy && <ChatMessageCopyButton content={msg.content} />}
                  </div>
                )}
              </div>
            </div>
          )
        })}
        {chatMode === 'change' && pendingIntent && (
          <RequestIntentCard
            intent={pendingIntent}
            busy={refineLoading}
            executorLabel={pendingIntentExecutorLabel}
            {...(pendingIntentRuntimeId !== null
              ? {
                  validation: pendingIntent.validatorSnapshot
                    ? { kind: 'model' as const, label: modelProfileLabel(pendingIntent.validatorSnapshot.profile) }
                    : executorOptions.find((option) => option.executorId === pendingIntentRuntimeId)?.devOnly
                      ? { kind: 'devOnly' as const }
                      : { kind: 'none' as const },
                }
              : {})}
            onApprove={(answers) => void approveRequestIntent(answers)}
            onRevise={reviseRequestIntent}
          />
        )}
        {chatMode === 'change' && pendingRefinement && !pendingIntent && !refinementConfirmed && (
          <PromptRefinementCard
            refinement={pendingRefinement}
            targetFile={selectedFilePath}
            confirmed={refinementConfirmed}
            confirming={refineLoading}
            onConfirm={(payload) => void confirmRefinement(payload)}
            onRevise={handleRevise}
          />
        )}
        {reviewingPoolTask &&
        (!reviewingPoolTask.chatSessionId ||
          reviewingPoolTask.chatSessionId === activeSessionId) ? (
          <AgentPoolAcceptanceCard task={reviewingPoolTask} />
        ) : null}
        {planActivityRows.map((activity) => (
          <AgentActivitySummaryRow
            key={activity.id}
            id={activity.id}
            status={activity.status}
            summary={activity.summary}
            onOpen={() => openActivity(activity.id)}
          />
        ))}
        {pendingDiagramSummary ? (
          <DiagramSummaryCard summary={pendingDiagramSummary} />
        ) : null}
        {pendingWireframeSummary ? (
          <WireframePackSummaryCard summary={pendingWireframeSummary} />
        ) : null}
        {chatMode === 'plan' && pendingPlan && (
          <PlanReviewCard
            plan={pendingPlan}
            confirmed={planConfirmed}
            submittingClarification={refineLoading}
            onBuild={() => void confirmPlanBuild()}
            onRevise={() => revisePlan()}
            savingEdits={planSavingEdits}
            onSaveEdits={(patch) => {
              setPlanSavingEdits(true)
              void savePlanEdits(patch).finally(() => setPlanSavingEdits(false))
            }}
            onSaveToWorkspace={() => void savePlanToWorkspace()}
            onLoadFromWorkspace={() => void loadPlanFromWorkspace(pendingPlan.id)}
            workspacePlans={workspacePlans}
            onBrowseWorkspacePlans={() => {
              void listWorkspacePlans().then((plans) => {
                setWorkspacePlans(plans)
                if (plans.length === 0) {
                  useWorkbenchStore.getState().pushToast({
                    type: 'info',
                    message: ts('plan.noWorkspacePlans'),
                    autoDismiss: 2500,
                  })
                }
              })
            }}
            onSelectWorkspacePlan={(planId) => {
              void loadPlanFromWorkspace(planId)
              setWorkspacePlans([])
            }}
            onSubmitClarification={(answers) => void submitPlanClarification(answers)}
          />
        )}
        {chatMode === 'plan' && !pendingPlan && (
          <div className={styles.returnToPlanBar}>
            <button
              type="button"
              className={styles.returnToPlanBtn}
              onClick={() => {
                void listWorkspacePlans().then((plans) => {
                  setWorkspacePlans(plans)
                  if (plans.length === 0) {
                    useWorkbenchStore.getState().pushToast({
                      type: 'info',
                      message: ts('plan.noWorkspacePlans'),
                      autoDismiss: 2500,
                    })
                  }
                })
              }}
            >
              {ts('plan.openSavedPlan')}
            </button>
            {workspacePlans.length > 0 ? (
              <select
                className={styles.planSelect}
                defaultValue=""
                onChange={(event) => {
                  const value = event.target.value
                  if (!value) return
                  void loadPlanFromWorkspace(value)
                  setWorkspacePlans([])
                }}
              >
                <option value="" disabled>
                  {ts('plan.selectWorkspacePlanPlaceholder')}
                </option>
                {workspacePlans.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.objective}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
        )}
        {lastBuiltPlan && chatMode === 'change' && !pendingPlan && (
          <div className={styles.returnToPlanBar}>
            <button type="button" className={styles.returnToPlanBtn} onClick={() => returnToPlan()}>
              {ts('plan.returnToPlan')}
            </button>
          </div>
        )}
        {debugActivityRows.map((activity) => (
          <AgentActivitySummaryRow
            key={activity.id}
            id={activity.id}
            status={activity.status}
            summary={activity.summary}
            onOpen={() => openActivity(activity.id)}
          />
        ))}
        {chatMode === 'debug' && debugSession && (
          <DebugSessionPanel
            session={debugSession}
            fixInProgress={refineLoading || flowStatus === 'running'}
            onReproduced={() => void submitDebugRepro()}
            onConfirmFix={() => void confirmDebugFix()}
            fixPending={debugFixPending}
            onMarkFixed={requestDebugCleanup}
            onConfirmBugAlignment={(bugs) => void confirmBugAlignment(bugs)}
            onMarkBugFixed={(bugId) => void markBugFixed(bugId)}
          />
        )}
        {chatMode === 'debug' && debugSession && !refineLoading && flowStatus !== 'running' ? (
          <div className={styles.debugChatCta}>
            {debugSession.phase === 'hypothesize' ? (
              <button
                type="button"
                className={styles.debugCtaButton}
                onClick={() => void submitDebugRepro()}
              >
                {ts('debug.chatCtaContinue')}
              </button>
            ) : null}
            {debugSession.phase === 'reproduce' ? (
              <button
                type="button"
                className={styles.debugCtaButton}
                onClick={() => void submitDebugRepro()}
              >
                {ts('debug.chatCtaReproduce')}
              </button>
            ) : null}
            {debugSession.phase === 'fix' ? (
              <button
                type="button"
                className={styles.debugCtaButton}
                onClick={() => void confirmDebugFix()}
              >
                {ts('debug.chatCtaApplyFix')}
              </button>
            ) : null}
            {debugSession.phase === 'verify' ? (
              <button
                type="button"
                className={styles.debugCtaButton}
                onClick={requestDebugCleanup}
              >
                {ts('debug.chatCtaMarkFixed')}
              </button>
            ) : null}
          </div>
        ) : null}
        {chatMode === 'ask' &&
        askSubMode === 'first_principles' &&
        pendingFirstPrinciples?.status === 'layer_active' ? (
          <FirstPrinciplesLayerCard
            session={pendingFirstPrinciples}
            submitting={firstPrinciplesBusy}
            onAnswer={(input) => void answerFirstPrinciplesQuestion(input)}
          />
        ) : null}
        {chatMode === 'ask' &&
        askSubMode === 'first_principles' &&
        pendingFirstPrinciples?.status === 'conflict' ? (
          <FirstPrinciplesConflictCard
            session={pendingFirstPrinciples}
            submitting={firstPrinciplesBusy}
            onResolve={(resolution, rephraseText) =>
              void resolveFirstPrinciplesConflict(resolution, rephraseText)
            }
          />
        ) : null}
        {chatMode === 'ask' &&
        askSubMode === 'first_principles' &&
        pendingFirstPrinciples &&
        (pendingFirstPrinciples.status === 'thesis_review' ||
          pendingFirstPrinciples.status === 'concluded') ? (
          <>
            <ThesisReviewCard
              session={pendingFirstPrinciples}
              submitting={firstPrinciplesBusy}
              onConfirm={(thesis, ack, writeFeature) =>
                void confirmFirstPrinciplesThesis(thesis, ack, writeFeature)
              }
              onPivot={() => void pivotFirstPrinciples()}
            />
            <ThesisHandoffBar
              session={pendingFirstPrinciples}
              busy={firstPrinciplesBusy}
              onHandoff={(target) => void handoffFirstPrinciples(target)}
            />
          </>
        ) : null}
        {runActivityRows.map((activity) => (
          <AgentActivitySummaryRow
            key={activity.id}
            id={activity.id}
            status={activity.status}
            summary={activity.summary}
            onOpen={() => openActivity(activity.id)}
          />
        ))}
        {refineLoading && (
          <AgentActivityIndicator
            className={styles.refiningStatus}
            variant="pill"
            state="composing"
            label={ts('chat.refining')}
          />
        )}
        </div>
        <ConversationNavRail
          turns={navTurns}
          scrollParentRef={messagesRef}
          scopeRef={panelRef}
          modeLabel={chatModeNavLabel}
          flashClassName={styles.navFlash}
        />
      </div>
      <form className={styles.inputArea} onSubmit={handleSubmit}>
        {pendingChangesDrawerVisible && diffFileStats.length > 0 ? (
          <PendingChangesDrawer
            files={diffFileStats}
            expanded={pendingChangesDrawerExpanded}
            undoMode={pendingChangesUndoMode}
            undoLoading={undoLoading}
            onToggleExpanded={() =>
              setPendingChangesDrawerExpanded(!pendingChangesDrawerExpanded)}
            onReview={() => void navigateToDiffReviewFile()}
            onReviewFile={(path) => void navigateToDiffReviewFile(path)}
            onUndoAll={() => void undoAllPendingChanges()}
          />
        ) : null}

        <div className={styles.inputStack}>
          <LoopAuthoringBanner />
          {activeCustomModeSkillId ? (
            <div
              className={styles.customModeChip}
              style={
                customModeMeta?.color
                  ? { borderColor: customModeMeta.color, ['--custom-mode-accent' as string]: customModeMeta.color }
                  : undefined
              }
            >
              <CustomModeIcon
                icon={customModeMeta?.icon}
                className={styles.customModeIcon}
                color={customModeMeta?.color}
              />
              <span>
                {ts('chat.customModeActive', {
                  name: customModeMeta?.name ?? activeCustomModeSkillId,
                })}
              </span>
              <div className={styles.suggestPlanActions}>
                <button
                  type="button"
                  className={styles.returnToPlanBtn}
                  onClick={() => exitCustomMode()}
                >
                  {ts('chat.exitCustomMode')}
                </button>
              </div>
            </div>
          ) : null}
          {!suggestPlanDismissed &&
          shouldSuggestPlanMode(composerDraft.text, chatMode) ? (
            <div className={styles.suggestPlanBanner}>
              <span>{ts('plan.suggestBanner')}</span>
              <div className={styles.suggestPlanActions}>
                <button
                  type="button"
                  className={styles.returnToPlanBtn}
                  onClick={() => void setChatMode('plan')}
                >
                  {ts('plan.suggestBannerAction')}
                </button>
                <button
                  type="button"
                  className={styles.returnToPlanBtn}
                  onClick={() => setSuggestPlanDismissed(true)}
                >
                  {ts('plan.suggestBannerDismiss')}
                </button>
              </div>
            </div>
          ) : null}
          {chatMode === 'ask' &&
          askSubMode === 'chat' &&
          !firstPrinciplesSuggestDismissed &&
          looksLikeVisionPrompt(composerDraft.text) ? (
            <FirstPrinciplesSuggestChip
              onAccept={() => {
                const vision = composerDraft.text.trim()
                if (!vision) {
                  setAskSubMode('first_principles')
                  return
                }
                void beginFirstPrinciplesFromVision(vision)
              }}
              onDismiss={() => dismissFirstPrinciplesSuggest()}
            />
          ) : null}
          <VoiceInputErrorBanner
            errorKey={voiceState.error}
            onDismiss={dismissError}
            labels={voiceLabels}
          />
          {pendingWorkforceDraft && pendingWorkforceDraft.source === 'chat' ? (
            <AgentDraftCard
              draft={pendingWorkforceDraft.draft}
              source="chat"
              busy={workforceDraftBusy}
              onChange={updatePendingWorkforceDraft}
              onCancel={() => dismissWorkforceDraft()}
              onConfirm={(options) => {
                setWorkforceDraftBusy(true)
                void confirmWorkforceDraft(options)
                  .catch(() => undefined)
                  .finally(() => setWorkforceDraftBusy(false))
              }}
            />
          ) : null}
          <PromptComposer
            draft={composerDraft}
            onDraftChange={setComposerDraft}
            onModeSelect={(mode) => void setChatMode(mode)}
            onChatModeChange={(mode) => {
              cancelCreateAgentComposer()
              void setChatMode(mode)
            }}
            onUseAsCustomMode={(skillId) => setActiveCustomModeSkillId(skillId)}
            disabled={refineLoading && flowStatus !== 'running'}
            chatMode={chatMode}
            submitDisabled={
              !composerDraft.text.trim() ||
              refineLoading ||
              (!createAgentComposerActive && !canSubmit)
            }
            stopVisible={agentStopVisible}
            onStop={() => void stopAgentRun()}
            voice={{
              isRecording,
              isTranscribing,
              busyLabel: voiceBusyLabel,
              labels: voiceLabels,
              micDisabled: refineLoading,
              isSupported,
              onMicToggle: handleVoiceToggle,
            }}
            placeholder={
              createAgentComposerActive
                ? ts('workforce.createAgentPlaceholder')
                : ts(
                    chatMode === 'ask'
                      ? askSubMode === 'first_principles'
                        ? 'chat.firstPrinciplesPlaceholder'
                        : 'chat.askPlaceholder'
                      : chatMode === 'anchored'
                        ? 'chat.anchoredPlaceholder'
                        : chatMode === 'plan'
                          ? pendingPlan?.status === 'needs_clarification'
                            ? 'plan.planClarificationPlaceholder'
                            : 'chat.planPlaceholder'
                          : chatMode === 'debug'
                            ? 'chat.debugPlaceholder'
                            : 'chat.placeholder',
                  )
            }
            onKeyDownExtra={(event) => {
              if (event.key === 'Escape' && createAgentComposerActive) {
                event.preventDefault()
                cancelCreateAgentComposer()
                return
              }
              if (event.key === 'Escape' && (isRecording || isTranscribing)) {
                event.preventDefault()
                setComposerDraft(setComposerText(composerDraft, baseInputRef.current))
                cancelVoice()
                return
              }
              if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.code === 'Space') {
                event.preventDefault()
                handleVoiceToggle()
                return
              }
              if (event.key === 'Tab' && event.shiftKey) {
                event.preventDefault()
                void setChatMode(cycleChatMode(chatMode))
                return
              }
              if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                event.preventDefault()
                if (isRecording) stopVoice()
                if (
                  composerDraft.text.trim() &&
                  !refineLoading &&
                  (createAgentComposerActive || canSubmit)
                ) {
                  void sendPrompt(composerDraft)
                }
              }
            }}
          />
        </div>
      </form>
    </div>
  )
}
