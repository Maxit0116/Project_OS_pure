import { useEffect, useRef } from 'react'
import { GitBranch } from 'lucide-react'
import { canSubmitAgentPrompt, useWorkbenchStore } from '../../state/workbenchStore'
import { useChatSessionStore } from '../../state/chatSessionStore'
import {
  selectPendingChangesDrawerUndoMode,
  selectPendingChangesDrawerVisible,
} from '../../state/pendingChangesDrawer'
import PendingChangesDrawer from '../PendingChangesDrawer/PendingChangesDrawer'
import { useI18n } from '../../i18n'
import PromptRefinementCard from './PromptRefinementCard'
import PlanReviewCard from './PlanReviewCard'
import DebugSessionPanel from './DebugSessionPanel'
import { cycleChatMode } from './ChatModeSelector'
import ChatMessageContent from './ChatMessageContent'
import ChatMessageCopyButton from './ChatMessageCopyButton'
import InheritedSessionCard from './InheritedSessionCard'
import AgentActivityIndicator from '../ui/AgentActivityIndicator'
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
import styles from './ChatPanel.module.css'

export default function ChatPanel() {
  const messages = useWorkbenchStore((s) => s.messages)
  const inheritedDigest = useChatSessionStore((s) => s.inheritedDigest)
  const activeSessionId = useChatSessionStore((s) => s.activeSessionId)
  const forkSession = useChatSessionStore((s) => s.forkSession)
  const composerDraft = useWorkbenchStore((s) => s.composerDraft)
  const setComposerDraft = useWorkbenchStore((s) => s.setComposerDraft)
  const setChatInput = useWorkbenchStore((s) => s.setChatInput)
  const sendPrompt = useWorkbenchStore((s) => s.sendPrompt)
  const pendingRefinement = useWorkbenchStore((s) => s.pendingRefinement)
  const pendingPlan = useWorkbenchStore((s) => s.pendingPlan)
  const planConfirmed = useWorkbenchStore((s) => s.planConfirmed)
  const debugSession = useWorkbenchStore((s) => s.debugSession)
  const refinementConfirmed = useWorkbenchStore((s) => s.refinementConfirmed)
  const confirmRefinement = useWorkbenchStore((s) => s.confirmRefinement)
  const confirmPlanBuild = useWorkbenchStore((s) => s.confirmPlanBuild)
  const submitPlanClarification = useWorkbenchStore((s) => s.submitPlanClarification)
  const revisePlan = useWorkbenchStore((s) => s.revisePlan)
  const submitDebugRepro = useWorkbenchStore((s) => s.submitDebugRepro)
  const confirmDebugFix = useWorkbenchStore((s) => s.confirmDebugFix)
  const markDebugFixed = useWorkbenchStore((s) => s.markDebugFixed)
  const reviseRefinement = useWorkbenchStore((s) => s.reviseRefinement)
  const refineLoading = useWorkbenchStore((s) => s.refineLoading)
  const flowStatus = useWorkbenchStore((s) => s.flowStatus)
  const chatMode = useWorkbenchStore((s) => s.chatMode)
  const selectedFilePath = useWorkbenchStore((s) => s.selectedFilePath)
  const setChatMode = useWorkbenchStore((s) => s.setChatMode)
  const canSubmit = useWorkbenchStore(canSubmitAgentPrompt)
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
  const messagesRef = useRef<HTMLDivElement>(null)
  const baseInputRef = useRef('')
  const voiceUpdatingRef = useRef(false)
  const voiceBackend = useChatVoiceBackend(locale)

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
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [messages, pendingRefinement, pendingPlan, debugSession, refineLoading])

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

  return (
    <div className={styles.panel}>
      <div className={styles.messages} ref={messagesRef}>
        {inheritedDigest ? <InheritedSessionCard digest={inheritedDigest} /> : null}
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
          return (
            <div key={msg.id} className={`${styles.message} ${styles[msg.role]}`}>
              <div className={styles.messageBody}>
                {msg.role === 'user' && (attachments.length || msg.invokedSkillId) ? (
                  <AttachmentChips
                    attachments={attachments}
                    invokedSkillLabel={msg.invokedSkillId}
                  />
                ) : null}
                <div className={styles.bubble} title={formatTime(msg.timestamp)}>
                  <ChatMessageContent message={msg} />
                </div>
                {(showCopy || showBranch) && (
                  <div className={styles.messageActions}>
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
        {chatMode === 'change' && pendingRefinement && !refinementConfirmed && (
          <PromptRefinementCard
            refinement={pendingRefinement}
            targetFile={selectedFilePath}
            confirmed={refinementConfirmed}
            onConfirm={() => void confirmRefinement()}
            onRevise={handleRevise}
          />
        )}
        {chatMode === 'plan' && pendingPlan && (
          <PlanReviewCard
            plan={pendingPlan}
            confirmed={planConfirmed}
            submittingClarification={refineLoading}
            onBuild={() => void confirmPlanBuild()}
            onRevise={() => revisePlan()}
            onSubmitClarification={(answers) => void submitPlanClarification(answers)}
          />
        )}
        {chatMode === 'debug' && debugSession && (
          <DebugSessionPanel
            session={debugSession}
            fixInProgress={refineLoading || flowStatus === 'running'}
            onReproduced={() => void submitDebugRepro()}
            onConfirmFix={() => void confirmDebugFix()}
            onMarkFixed={() => void markDebugFixed()}
          />
        )}
        {refineLoading && (
          <AgentActivityIndicator
            className={styles.refiningStatus}
            variant="pill"
            state="composing"
            label={ts('chat.refining')}
          />
        )}
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
          <VoiceInputErrorBanner
            errorKey={voiceState.error}
            onDismiss={dismissError}
            labels={voiceLabels}
          />
          <PromptComposer
            draft={composerDraft}
            onDraftChange={setComposerDraft}
            onModeSelect={setChatMode}
            onChatModeChange={setChatMode}
            disabled={refineLoading}
            chatMode={chatMode}
            submitDisabled={!composerDraft.text.trim() || refineLoading || !canSubmit}
            voice={{
              isRecording,
              isTranscribing,
              busyLabel: voiceBusyLabel,
              labels: voiceLabels,
              micDisabled: refineLoading,
              isSupported,
              onMicToggle: handleVoiceToggle,
            }}
            placeholder={ts(
              chatMode === 'ask'
                ? 'chat.askPlaceholder'
                : chatMode === 'anchored'
                ? 'chat.anchoredPlaceholder'
                : chatMode === 'plan'
                ? pendingPlan?.status === 'needs_clarification'
                  ? 'plan.planClarificationPlaceholder'
                  : 'chat.planPlaceholder'
                : chatMode === 'debug'
                ? 'chat.debugPlaceholder'
                : 'chat.placeholder',
            )}
            onKeyDownExtra={(event) => {
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
                setChatMode(cycleChatMode(chatMode))
                return
              }
              if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                event.preventDefault()
                if (isRecording) stopVoice()
                if (composerDraft.text.trim() && !refineLoading && canSubmit) {
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
