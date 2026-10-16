import { useMemo, useState, type KeyboardEvent } from 'react'
import { ChevronUp } from 'lucide-react'
import type { LoopComposerMode, LoopOpenQuestion } from '@contracts/index'
import { useI18n } from '../../i18n'
import { useLoopGraphStore } from '../../state/loopGraphStore'
import AgentActivityIndicator from '../ui/AgentActivityIndicator'
import styles from './LoopGoalComposer.module.css'

export default function LoopGoalComposer() {
  const { ts } = useI18n()
  const document = useLoopGraphStore((s) => s.document)
  const composerDraft = useLoopGraphStore((s) => s.composerDraft)
  const composerSheet = useLoopGraphStore((s) => s.composerSheet)
  const authoringBusy = useLoopGraphStore((s) => s.authoringBusy)
  const setComposerDraft = useLoopGraphStore((s) => s.setComposerDraft)
  const setComposerSheet = useLoopGraphStore((s) => s.setComposerSheet)
  const setComposerMode = useLoopGraphStore((s) => s.setComposerMode)
  const sendAuthoringTurn = useLoopGraphStore((s) => s.sendAuthoringTurn)
  const answerGoalClarification = useLoopGraphStore((s) => s.answerGoalClarification)
  const confirmGoalContext = useLoopGraphStore((s) => s.confirmGoalContext)
  const acceptGraphEditOffer = useLoopGraphStore((s) => s.acceptGraphEditOffer)
  const dismissGraphEditOffer = useLoopGraphStore((s) => s.dismissGraphEditOffer)
  const undoDraft = useLoopGraphStore((s) => s.undoDraft)

  const [clarifyAnswers, setClarifyAnswers] = useState<Record<string, string>>({})

  const mode: LoopComposerMode = document?.composerMode ?? 'ask'
  const draftContext = document?.draftGoalContext
  const confirmedContext = document?.confirmedGoalContext
  const context = draftContext ?? confirmedContext
  const trace = document?.authoringTrace
  const offer = document?.pendingGraphEditOffer
  const canUndo = (document?.draftHistory.length ?? 0) > 0

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

  if (!document) return null

  const toggleSheet = (sheet: 'flow' | 'context') => {
    setComposerSheet(composerSheet === sheet ? 'none' : sheet)
  }

  const onSend = () => {
    void sendAuthoringTurn()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      if (!authoringBusy && composerDraft.trim() && !(mode === 'ask' && needsClarification)) {
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
          className={styles.textarea}
          style={{ minHeight: 28, maxHeight: 48 }}
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

  return (
    <div className={styles.composer} data-loop-goal-composer="">
      <div className={styles.sheetTabs} role="tablist" aria-label={ts('chat.loopGraph.composerSheets')}>
        <button
          type="button"
          role="tab"
          aria-selected={composerSheet === 'flow'}
          className={`${styles.sheetTab} ${composerSheet === 'flow' ? styles.sheetTabActive : ''} ${
            authoringBusy || trace?.status === 'running' ? styles.sheetTabBusy : ''
          }`}
          onClick={() => toggleSheet('flow')}
        >
          <ChevronUp size={12} aria-hidden />
          {ts('chat.loopGraph.agentFlowSheet')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={composerSheet === 'context'}
          className={`${styles.sheetTab} ${composerSheet === 'context' ? styles.sheetTabActive : ''}`}
          onClick={() => toggleSheet('context')}
        >
          <ChevronUp size={12} aria-hidden />
          {ts('chat.loopGraph.goalContextSheet')}
        </button>
      </div>

      {composerSheet === 'flow' ? (
        <div className={styles.sheetPanel} role="tabpanel">
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

      {composerSheet === 'context' ? (
        <div className={styles.sheetPanel} role="tabpanel">
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
                  <strong>{ts('chat.loopGraph.goalDoneWhen')}</strong>: {context.doneWhen.join('; ')}
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

      {needsClarification ? (
        <div className={styles.clarifyCard} data-loop-goal-clarify="">
          <p>{ts('chat.loopGraph.clarifyHint')}</p>
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
          </div>
        </div>
      ) : null}

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

      <div className={styles.row}>
        <div className={styles.modes} role="group" aria-label={ts('chat.loopGraph.composerModes')}>
          <button
            type="button"
            className={`${styles.modeButton} ${mode === 'ask' ? styles.modeButtonActive : ''}`}
            aria-pressed={mode === 'ask'}
            disabled={authoringBusy}
            onClick={() => void setComposerMode('ask')}
          >
            {ts('chat.loopGraph.modeAsk')}
          </button>
          <button
            type="button"
            className={`${styles.modeButton} ${mode === 'edit' ? styles.modeButtonActive : ''}`}
            aria-pressed={mode === 'edit'}
            disabled={authoringBusy}
            onClick={() => void setComposerMode('edit')}
          >
            {ts('chat.loopGraph.modeEdit')}
          </button>
        </div>
        <textarea
          className={styles.textarea}
          value={composerDraft}
          placeholder={
            mode === 'ask'
              ? ts('chat.loopGraph.askPlaceholder')
              : ts('chat.loopGraph.editPlaceholder')
          }
          disabled={authoringBusy || (mode === 'ask' && needsClarification)}
          onChange={(event) => setComposerDraft(event.target.value)}
          onKeyDown={onKeyDown}
          rows={2}
          aria-label={ts('chat.loopGraph.composerInput')}
        />
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.undoButton}
            disabled={authoringBusy || !canUndo}
            title={ts('chat.loopGraph.undoDraft')}
            aria-label={ts('chat.loopGraph.undoDraft')}
            onClick={() => void undoDraft()}
          >
            {ts('chat.loopGraph.undoDraft')}
          </button>
          <button
            type="button"
            className={styles.sendButton}
            disabled={
              authoringBusy ||
              !composerDraft.trim() ||
              (mode === 'ask' && needsClarification)
            }
            onClick={onSend}
          >
            {ts('chat.loopGraph.send')}
          </button>
        </div>
      </div>

      {document.linkedSessionIds.length > 0 ? (
        <span className={styles.metaHint}>
          {ts('chat.loopGraph.linkedSessions', {
            count: String(document.linkedSessionIds.length),
          })}
        </span>
      ) : null}
    </div>
  )
}
