import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Bot, ChevronUp, MessageSquare, Pencil, Undo2 } from 'lucide-react'
import type { LoopComposerMode, LoopOpenQuestion } from '@contracts/index'
import { useAutoResizeTextarea } from '../../hooks/useAutoResizeTextarea'
import { useI18n } from '../../i18n'
import { useLoopGraphStore } from '../../state/loopGraphStore'
import { useWorkbenchStore } from '../../state/workbenchStore'
import { useComposePromptVoice } from '../ChatPanel/composer/useComposePromptVoice'
import {
  VoiceInputDock,
  VoiceInputErrorBanner,
} from '../ChatPanel/VoiceInputControls'
import AgentDraftCard from '../AgentWorkforce/AgentDraftCard'
import AgentActivityIndicator from '../ui/AgentActivityIndicator'
import Button from '../ui/Button'
import Chip from '../ui/Chip'
import styles from './LoopGoalComposer.module.css'

const COMPOSER_MODES: LoopComposerMode[] = ['ask', 'edit', 'create_agent']

const MODE_ICON = {
  ask: MessageSquare,
  edit: Pencil,
  create_agent: Bot,
} as const

export default function LoopGoalComposer() {
  const { ts, locale } = useI18n()
  const loopDocument = useLoopGraphStore((s) => s.document)
  const composerDraft = useLoopGraphStore((s) => s.composerDraft)
  const composerSheet = useLoopGraphStore((s) => s.composerSheet)
  const authoringBusy = useLoopGraphStore((s) => s.authoringBusy)
  const setComposerDraft = useLoopGraphStore((s) => s.setComposerDraft)
  const toggleComposerSheet = useLoopGraphStore((s) => s.toggleComposerSheet)
  const setComposerMode = useLoopGraphStore((s) => s.setComposerMode)
  const sendAuthoringTurn = useLoopGraphStore((s) => s.sendAuthoringTurn)
  const answerGoalClarification = useLoopGraphStore((s) => s.answerGoalClarification)
  const cancelGoalClarification = useLoopGraphStore((s) => s.cancelGoalClarification)
  const confirmGoalContext = useLoopGraphStore((s) => s.confirmGoalContext)
  const acceptGraphEditOffer = useLoopGraphStore((s) => s.acceptGraphEditOffer)
  const dismissGraphEditOffer = useLoopGraphStore((s) => s.dismissGraphEditOffer)
  const undoDraft = useLoopGraphStore((s) => s.undoDraft)
  const beginAuthorNodeFromPalette = useLoopGraphStore((s) => s.beginAuthorNodeFromPalette)
  const expandAgentWiring = useLoopGraphStore((s) => s.expandAgentWiring)
  const submitCreateAgentPrompt = useWorkbenchStore((s) => s.submitCreateAgentPrompt)
  const pendingWorkforceDraft = useWorkbenchStore((s) => s.pendingWorkforceDraft)
  const updatePendingWorkforceDraft = useWorkbenchStore((s) => s.updatePendingWorkforceDraft)
  const confirmWorkforceDraft = useWorkbenchStore((s) => s.confirmWorkforceDraft)
  const dismissWorkforceDraft = useWorkbenchStore((s) => s.dismissWorkforceDraft)
  const beginCreateAgentComposer = useWorkbenchStore((s) => s.beginCreateAgentComposer)
  const cancelCreateAgentComposer = useWorkbenchStore((s) => s.cancelCreateAgentComposer)

  const [clarifyAnswers, setClarifyAnswers] = useState<Record<string, string>>({})
  const [modeMenuOpen, setModeMenuOpen] = useState(false)
  const [draftBusy, setDraftBusy] = useState(false)
  const modeMenuRef = useRef<HTMLDivElement>(null)
  const textareaRef = useAutoResizeTextarea(composerDraft, 200)

  const mode: LoopComposerMode = loopDocument?.composerMode ?? 'ask'
  const draftContext = loopDocument?.draftGoalContext
  const confirmedContext = loopDocument?.confirmedGoalContext
  const context = draftContext ?? confirmedContext
  const trace = loopDocument?.authoringTrace
  const offer = loopDocument?.pendingGraphEditOffer
  const canUndo = (loopDocument?.draftHistory?.length ?? 0) > 0

  const openQuestions = draftContext?.openQuestions ?? []
  const needsClarification = openQuestions.some((q) => !q.answer?.trim())
  const canConfirm =
    Boolean(draftContext) &&
    draftContext?.status !== 'confirmed' &&
    !needsClarification &&
    !authoringBusy

  const recentSteps = useMemo(() => {
    const steps = trace?.steps ?? []
    return steps.slice(-5)
  }, [trace?.steps])

  const currentStep = useMemo(() => {
    if (!trace?.currentStepId) return recentSteps[recentSteps.length - 1]
    return recentSteps.find((step) => step.id === trace.currentStepId) ?? recentSteps.at(-1)
  }, [recentSteps, trace?.currentStepId])

  const voiceDisabled =
    !loopDocument || authoringBusy || draftBusy || (mode === 'ask' && needsClarification)

  const onSend = useCallback(
    (overrideText?: string) => {
      const currentMode = useLoopGraphStore.getState().document?.composerMode ?? 'ask'
      if (currentMode === 'create_agent') {
        const text = (overrideText ?? useLoopGraphStore.getState().composerDraft).trim()
        if (!text) return
        setDraftBusy(true)
        setComposerDraft('')
        void submitCreateAgentPrompt(text, 'loop').finally(() => setDraftBusy(false))
        return
      }
      void sendAuthoringTurn()
    },
    [sendAuthoringTurn, setComposerDraft, submitCreateAgentPrompt],
  )

  const composeVoice = useComposePromptVoice({
    locale,
    disabled: voiceDisabled,
    getText: () => useLoopGraphStore.getState().composerDraft,
    setText: setComposerDraft,
    onSubmit: (text) => onSend(text),
  })

  useEffect(() => {
    if (!modeMenuOpen) return
    const onPointerDown = (event: MouseEvent) => {
      if (!modeMenuRef.current?.contains(event.target as Node)) {
        setModeMenuOpen(false)
      }
    }
    window.document.addEventListener('mousedown', onPointerDown)
    return () => window.document.removeEventListener('mousedown', onPointerDown)
  }, [modeMenuOpen])

  if (!loopDocument) return null

  const ModeIcon = MODE_ICON[mode]
  const modeLabel =
    mode === 'ask'
      ? ts('chat.loopGraph.modeDiscuss')
      : mode === 'create_agent'
        ? ts('workforce.createAgentMode')
        : ts('chat.loopGraph.modeEdit')
  const submitDisabled =
    authoringBusy ||
    draftBusy ||
    !composerDraft.trim() ||
    (mode === 'ask' && needsClarification)

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      event.key === 'Escape' &&
      (composeVoice.voice.isRecording || composeVoice.voice.isTranscribing)
    ) {
      event.preventDefault()
      composeVoice.cancelVoice()
      return
    }
    if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.code === 'Space') {
      event.preventDefault()
      composeVoice.dockProps.onMicToggle()
      return
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      if (!submitDisabled) {
        if (composeVoice.voice.isRecording || composeVoice.voice.isTranscribing) {
          composeVoice.stopVoice()
        }
        onSend()
      }
    }
  }

  const submitClarifications = () => {
    const answers = openQuestions
      .map((q) => ({
        questionId: q.id,
        answer: (clarifyAnswers[q.id] ?? q.answer ?? '').trim(),
      }))
      .filter((item) => item.answer)
    if (answers.length === 0) return
    void answerGoalClarification(answers)
    setClarifyAnswers({})
  }

  const renderQuestion = (question: LoopOpenQuestion) => {
    const value = clarifyAnswers[question.id] ?? question.answer ?? ''
    return (
      <div key={question.id} className={styles.clarifyQuestion}>
        <label htmlFor={`loop-clarify-${question.id}`}>{question.question}</label>
        {question.options && question.options.length > 0 ? (
          <div className={styles.clarifyOptions}>
            {question.options.map((option) => (
              <button
                key={option}
                type="button"
                className={`${styles.chip} ${value === option ? styles.chipActive : ''}`}
                onClick={() =>
                  setClarifyAnswers((current) => ({ ...current, [question.id]: option }))
                }
              >
                {option}
              </button>
            ))}
          </div>
        ) : null}
        <input
          id={`loop-clarify-${question.id}`}
          className={styles.clarifyInput}
          value={value}
          placeholder={ts('chat.loopGraph.clarifyCustom')}
          onChange={(event) =>
            setClarifyAnswers((current) => ({
              ...current,
              [question.id]: event.target.value,
            }))
          }
        />
      </div>
    )
  }

  const flowOpen = composerSheet === 'flow'
  const contextOpen = composerSheet === 'context'
  const clarifyOpen = composerSheet === 'clarify' && needsClarification

  return (
    <div className={styles.composer} data-loop-goal-composer="">
      <div className={styles.bookmarkStack}>
        <div
          className={styles.bookmarkTabs}
          role="tablist"
          aria-label={ts('chat.loopGraph.composerSheets')}
        >
          <button
            type="button"
            role="tab"
            aria-selected={flowOpen}
            className={`${styles.bookmarkTab} ${flowOpen ? styles.bookmarkTabActive : ''} ${
              authoringBusy || trace?.status === 'running' ? styles.bookmarkTabBusy : ''
            }`}
            onClick={() => toggleComposerSheet('flow')}
          >
            <ChevronUp
              size={11}
              aria-hidden
              className={flowOpen ? styles.bookmarkChevronOpen : undefined}
            />
            {ts('chat.loopGraph.agentFlowSheet')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={contextOpen}
            className={`${styles.bookmarkTab} ${contextOpen ? styles.bookmarkTabActive : ''}`}
            onClick={() => toggleComposerSheet('context')}
          >
            <ChevronUp
              size={11}
              aria-hidden
              className={contextOpen ? styles.bookmarkChevronOpen : undefined}
            />
            {ts('chat.loopGraph.goalContextSheet')}
          </button>
          {needsClarification ? (
            <button
              type="button"
              role="tab"
              aria-selected={clarifyOpen}
              className={`${styles.bookmarkTab} ${clarifyOpen ? styles.bookmarkTabActive : ''} ${
                styles.bookmarkTabAttention
              }`}
              onClick={() => toggleComposerSheet('clarify')}
            >
              <ChevronUp
                size={11}
                aria-hidden
                className={clarifyOpen ? styles.bookmarkChevronOpen : undefined}
              />
              {ts('chat.loopGraph.clarifySheet')}
            </button>
          ) : null}
        </div>

        {flowOpen ? (
          <div className={styles.sheetPanel} role="tabpanel" data-loop-sheet="flow">
            {authoringBusy || currentStep ? (
              <div className={styles.flowCurrent}>
                <AgentActivityIndicator
                  state={authoringBusy || trace?.status === 'running' ? 'working' : 'composing'}
                  label={
                    authoringBusy
                      ? ts('chat.loopGraph.authoringWorking')
                      : (currentStep?.label ?? ts('chat.loopGraph.authoringIdle'))
                  }
                />
              </div>
            ) : (
              <p className={styles.contextEmpty}>{ts('chat.loopGraph.authoringIdle')}</p>
            )}
            {recentSteps.length > 0 ? (
              <ul className={styles.flowSteps}>
                {recentSteps.map((step) => (
                  <li
                    key={step.id}
                    className={`${styles.flowStep} ${
                      step.id === currentStep?.id ? styles.flowStepCurrent : ''
                    }`}
                  >
                    {step.label}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        {contextOpen ? (
          <div className={styles.sheetPanel} role="tabpanel" data-loop-sheet="context">
            {!context ? (
              <p className={styles.contextEmpty}>{ts('chat.loopGraph.goalContextEmpty')}</p>
            ) : (
              <div className={styles.contextBlock}>
                <h3 className={styles.contextTitle}>{context.goal}</h3>
                <div className={styles.contextMeta}>
                  {ts('chat.loopGraph.goalContextStatus', {
                    status: ts(`chat.loopGraph.goalContextStatusValue.${context.status}`),
                    revision: String(context.revision),
                  })}
                </div>
                {context.constraints.length > 0 ? (
                  <p className={styles.contextSection}>
                    <strong>{ts('chat.loopGraph.goalConstraints')}</strong>:{' '}
                    {context.constraints.join('; ')}
                  </p>
                ) : null}
                {context.doneWhen.length > 0 ? (
                  <p className={styles.contextSection}>
                    <strong>{ts('chat.loopGraph.goalDoneWhen')}</strong>:{' '}
                    {context.doneWhen.join('; ')}
                  </p>
                ) : null}
                {context.outOfScope.length > 0 ? (
                  <p className={styles.contextSection}>
                    <strong>{ts('chat.loopGraph.goalOutOfScope')}</strong>:{' '}
                    {context.outOfScope.join('; ')}
                  </p>
                ) : null}
                {canConfirm ? (
                  <div className={styles.offerActions}>
                    <button
                      type="button"
                      className={`${styles.actionButton} ${styles.actionButtonPrimary}`}
                      disabled={authoringBusy}
                      onClick={() => void confirmGoalContext()}
                    >
                      {ts('chat.loopGraph.confirmGoalContext')}
                    </button>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        ) : null}

        {clarifyOpen ? (
          <div
            className={`${styles.sheetPanel} ${styles.clarifySheetPanel}`}
            role="tabpanel"
            data-loop-sheet="clarify"
            data-loop-goal-clarify=""
          >
            <p className={styles.clarifyHint}>{ts('chat.loopGraph.clarifyHint')}</p>
            {openQuestions.filter((q) => !q.answer?.trim()).map(renderQuestion)}
            <div className={styles.clarifyActions}>
              <button
                type="button"
                className={`${styles.actionButton} ${styles.actionButtonPrimary}`}
                disabled={authoringBusy}
                onClick={submitClarifications}
              >
                {ts('chat.loopGraph.submitClarifications')}
              </button>
              <button
                type="button"
                className={styles.actionButton}
                disabled={authoringBusy}
                onClick={() => {
                  setClarifyAnswers({})
                  void cancelGoalClarification()
                }}
              >
                {ts('chat.loopGraph.cancelClarifications')}
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {offer ? (
        <div className={styles.offerCard} data-loop-graph-edit-offer="">
          <p>{offer.reason}</p>
          <div className={styles.offerActions}>
            <button
              type="button"
              className={`${styles.actionButton} ${styles.actionButtonPrimary}`}
              disabled={authoringBusy}
              onClick={() => void acceptGraphEditOffer()}
            >
              {ts('chat.loopGraph.acceptGraphEdit')}
            </button>
            <button
              type="button"
              className={styles.actionButton}
              disabled={authoringBusy}
              onClick={() => void dismissGraphEditOffer()}
            >
              {ts('chat.loopGraph.dismissGraphEdit')}
            </button>
          </div>
        </div>
      ) : null}

      {pendingWorkforceDraft && pendingWorkforceDraft.source === 'loop' ? (
        <AgentDraftCard
          draft={pendingWorkforceDraft.draft}
          source="loop"
          busy={draftBusy}
          onChange={updatePendingWorkforceDraft}
          onCancel={() => {
            dismissWorkforceDraft()
            void setComposerMode('ask')
          }}
          onConfirm={(options) => {
            setDraftBusy(true)
            void confirmWorkforceDraft(options)
              .then(async (created) => {
                if (created && options?.placeOnLoop) {
                  const nodeId = await beginAuthorNodeFromPalette(
                    'agent.coder',
                    { x: 120, y: 120 },
                    {
                      agentDefinitionId: created.definitionId,
                      title: created.config.displayName,
                    },
                  )
                  if (nodeId) {
                    expandAgentWiring(
                      nodeId,
                      {
                        modelProfileId: created.config.modelProfileId ?? undefined,
                        skillIds: created.config.skillIds ?? [],
                        mcpServerIds: created.config.mcpServerIds ?? [],
                      },
                      { replaceExistingProvides: true },
                    )
                  }
                }
                void setComposerMode('ask')
              })
              .finally(() => setDraftBusy(false))
          }}
        />
      ) : null}

      <div className={styles.promptDock}>
        {composeVoice.voice.state.error ? (
          <VoiceInputErrorBanner
            errorKey={composeVoice.voice.state.error}
            onDismiss={composeVoice.voice.dismissError}
            labels={composeVoice.voiceLabels}
          />
        ) : null}
        <div className={styles.inputComposer}>
          <div className={styles.composerBody}>
            <textarea
              ref={textareaRef}
              className={styles.input}
              value={composerDraft}
              placeholder={
                mode === 'create_agent'
                  ? ts('workforce.createAgentPlaceholder')
                  : mode === 'ask'
                    ? ts('chat.loopGraph.askPlaceholder')
                    : ts('chat.loopGraph.editPlaceholder')
              }
              disabled={authoringBusy || draftBusy || (mode === 'ask' && needsClarification)}
              onChange={(event) => {
                const value = event.target.value
                setComposerDraft(value)
                composeVoice.syncBaseFromExternalText(value)
              }}
              onKeyDown={onKeyDown}
              rows={3}
              aria-label={ts('chat.loopGraph.composerInput')}
            />
          </div>
          <div className={styles.footer}>
            <div className={styles.leftCluster}>
              <div className={styles.menuWrap} ref={modeMenuRef}>
                <Chip
                  active={modeMenuOpen}
                  className={styles.modeChip}
                  aria-expanded={modeMenuOpen}
                  aria-haspopup="listbox"
                  aria-label={ts('chat.loopGraph.composerModes')}
                  disabled={authoringBusy}
                  onClick={() => setModeMenuOpen((open) => !open)}
                >
                  <ModeIcon size={14} strokeWidth={2} aria-hidden />
                  <span>{modeLabel}</span>
                  <span aria-hidden>▾</span>
                </Chip>
                {modeMenuOpen ? (
                  <div className={styles.dropdownAnchor} role="listbox">
                    {COMPOSER_MODES.map((option) => {
                      const OptionIcon = MODE_ICON[option]
                      const active = option === mode
                      const label =
                        option === 'ask'
                          ? ts('chat.loopGraph.modeDiscuss')
                          : option === 'create_agent'
                            ? ts('workforce.createAgentMode')
                            : ts('chat.loopGraph.modeEdit')
                      return (
                        <button
                          key={option}
                          type="button"
                          role="option"
                          aria-selected={active}
                          className={`${styles.menuItem} ${active ? styles.menuItemActive : ''}`}
                          onClick={() => {
                            if (option === 'create_agent') beginCreateAgentComposer('loop')
                            else cancelCreateAgentComposer()
                            void setComposerMode(option)
                            setModeMenuOpen(false)
                          }}
                        >
                          <OptionIcon size={15} strokeWidth={2} aria-hidden />
                          {label}
                        </button>
                      )
                    })}
                  </div>
                ) : null}
              </div>
            </div>
            <div className={styles.rightCluster}>
              <button
                type="button"
                className={styles.undoButton}
                disabled={authoringBusy || !canUndo}
                title={ts('chat.loopGraph.undoDraft')}
                aria-label={ts('chat.loopGraph.undoDraft')}
                onClick={() => void undoDraft()}
              >
                <Undo2 size={14} aria-hidden />
                <span>{ts('chat.loopGraph.undoDraft')}</span>
              </button>
              <VoiceInputDock {...composeVoice.dockProps} inline />
              <Button
                type="button"
                size="sm"
                disabled={submitDisabled}
                onClick={() => {
                  if (composeVoice.voice.isRecording || composeVoice.voice.isTranscribing) {
                    composeVoice.stopVoice()
                  }
                  onSend()
                }}
              >
                {ts('chat.loopGraph.send')}
              </Button>
            </div>
          </div>
        </div>

        {(loopDocument.linkedSessionIds?.length ?? 0) > 0 ? (
          <span className={styles.metaHint}>
            {ts('chat.loopGraph.linkedSessions', {
              count: String(loopDocument.linkedSessionIds.length),
            })}
          </span>
        ) : null}
      </div>
    </div>
  )
}
