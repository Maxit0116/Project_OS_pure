import { useEffect, useMemo, useState } from 'react'
import type { PromptRefinement } from '@contracts/index'
import { useI18n } from '../../i18n'
import Button from '../ui/Button'
import PlanClarificationQuestionItem from './PlanClarificationQuestionItem'
import {
  buildConfirmAlignmentPayload,
  createAlignmentDraft,
  ensureRefinementAlignment,
  guessItems,
  statedItems,
  type AlignmentDraftState,
} from './alignmentDraft'
import type { PlanQuestionDraft } from './planClarification'
import styles from './PromptRefinementCard.module.css'

interface Props {
  refinement: PromptRefinement
  targetFile: string | null
  confirmed: boolean
  confirming?: boolean
  onConfirm: (payload: ReturnType<typeof buildConfirmAlignmentPayload>['request']) => void
  onRevise: () => void
}

export default function PromptRefinementCard({
  refinement,
  targetFile,
  confirmed,
  confirming = false,
  onConfirm,
  onRevise,
}: Props) {
  const { ts } = useI18n()
  const contract = useMemo(() => ensureRefinementAlignment(refinement), [refinement])
  const [draft, setDraft] = useState<AlignmentDraftState>(() => createAlignmentDraft(contract))

  useEffect(() => {
    setDraft(createAlignmentDraft(contract))
  }, [contract.id, refinement.id])

  const stated = statedItems(contract)
  const guesses = guessItems(contract)
  const confirmGate = buildConfirmAlignmentPayload(refinement, contract, draft)
  const confirmDisabled = confirmed || confirming || !confirmGate.ready

  const updateItem = (
    itemId: string,
    patch: Partial<AlignmentDraftState['items'][string]>,
  ) => {
    setDraft((current) => {
      const previous = current.items[itemId] ?? {
        selected: false,
        comment: '',
        commentOpen: false,
      }
      return {
        ...current,
        items: {
          ...current.items,
          [itemId]: { ...previous, ...patch },
        },
      }
    })
  }

  const updateQuestion = (questionId: string, next: PlanQuestionDraft) => {
    setDraft((current) => ({
      ...current,
      questions: {
        ...current.questions,
        [questionId]: next,
      },
    }))
  }

  return (
    <div
      className={`${styles.card} fade-slide-up ${confirmed ? styles.confirmed : ''}`}
      data-testid="alignment-card"
    >
      <div className={styles.header}>
        <span className={styles.title}>{ts('alignment.title')}</span>
        <span className={styles.badge}>
          {refinement.mode === 'deterministic_fixture' ? ts('refinement.demo') : ts('refinement.model')}
        </span>
      </div>
      <p className={styles.explanation}>{ts('alignment.explanation')}</p>

      {stated.length > 0 && (
        <section className={styles.section} data-alignment-section="stated">
          <h4>{ts('alignment.stated')}</h4>
          <ul className={styles.itemList}>
            {stated.map((item) => {
              const itemDraft = draft.items[item.id]
              return (
                <li key={item.id} className={styles.itemRow}>
                  <label className={styles.itemCheck}>
                    <input
                      type="checkbox"
                      checked={itemDraft?.selected ?? item.selected}
                      disabled={confirmed || confirming}
                      onChange={(event) =>
                        updateItem(item.id, { selected: event.target.checked })
                      }
                    />
                    <span>{item.text}</span>
                  </label>
                  <button
                    type="button"
                    className={styles.commentToggle}
                    disabled={confirmed || confirming}
                    onClick={() =>
                      updateItem(item.id, { commentOpen: !(itemDraft?.commentOpen ?? false) })
                    }
                  >
                    {ts('alignment.addComment')}
                  </button>
                  {itemDraft?.commentOpen ? (
                    <textarea
                      className={styles.commentInput}
                      value={itemDraft.comment}
                      disabled={confirmed || confirming}
                      placeholder={ts('alignment.commentPlaceholder')}
                      rows={2}
                      onChange={(event) => updateItem(item.id, { comment: event.target.value })}
                    />
                  ) : null}
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {guesses.length > 0 && (
        <section className={`${styles.section} ${styles.guessSection}`} data-alignment-section="guess">
          <h4>{ts('alignment.guesses')}</h4>
          <p className={styles.sectionHelp}>{ts('alignment.guessesHelp')}</p>
          <ul className={styles.itemList}>
            {guesses.map((item) => {
              const itemDraft = draft.items[item.id]
              return (
                <li key={item.id} className={styles.itemRow}>
                  <label className={styles.itemCheck}>
                    <input
                      type="checkbox"
                      checked={itemDraft?.selected ?? item.selected}
                      disabled={confirmed || confirming}
                      onChange={(event) =>
                        updateItem(item.id, { selected: event.target.checked })
                      }
                    />
                    <span>{item.text}</span>
                  </label>
                  <button
                    type="button"
                    className={styles.commentToggle}
                    disabled={confirmed || confirming}
                    onClick={() =>
                      updateItem(item.id, { commentOpen: !(itemDraft?.commentOpen ?? false) })
                    }
                  >
                    {ts('alignment.addComment')}
                  </button>
                  {itemDraft?.commentOpen ? (
                    <textarea
                      className={styles.commentInput}
                      value={itemDraft.comment}
                      disabled={confirmed || confirming}
                      placeholder={ts('alignment.commentPlaceholder')}
                      rows={2}
                      onChange={(event) => updateItem(item.id, { comment: event.target.value })}
                    />
                  ) : null}
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {contract.questions.length > 0 && (
        <section className={styles.section} data-alignment-section="questions">
          <h4>{ts('alignment.questions')}</h4>
          <p className={styles.sectionHelp}>{ts('alignment.questionsHelp')}</p>
          <div className={styles.questionList}>
            {contract.questions.map((question, index) => (
              <PlanClarificationQuestionItem
                key={question.id}
                question={question}
                index={index}
                draft={draft.questions[question.id] ?? null}
                disabled={confirmed || confirming}
                onChange={(next) => updateQuestion(question.id, next)}
              />
            ))}
          </div>
        </section>
      )}

      {targetFile && (
        <section className={styles.section} data-refinement-section="target-file">
          <h4>{ts('refinement.targetFile')}</h4>
          <div className={styles.chips}>
            <span className={styles.chip}>{targetFile}</span>
          </div>
        </section>
      )}

      {refinement.affectedFiles.length > 0 && (
        <section className={styles.section} data-refinement-section="related-files">
          <h4>{ts('refinement.affectedFiles')}</h4>
          <p className={styles.sectionHelp}>{ts('refinement.affectedFilesHelp')}</p>
          <div className={styles.chips}>
            {refinement.affectedFiles.map((file) => (
              <span key={file} className={styles.chip}>{file}</span>
            ))}
          </div>
        </section>
      )}

      {!confirmed && (
        <div className={styles.actions}>
          <Button
            onClick={() => {
              if (!confirmGate.ready) return
              onConfirm(confirmGate.request)
            }}
            disabled={confirmDisabled}
            title={
              confirmGate.reason === 'blocking'
                ? ts('alignment.gateBlocking')
                : confirmGate.reason === 'none_selected'
                  ? ts('alignment.gateNoneSelected')
                  : undefined
            }
          >
            {ts('alignment.confirmRun')}
          </Button>
          <Button variant="secondary" onClick={onRevise} disabled={confirming}>
            {ts('alignment.reviseRequest')}
          </Button>
        </div>
      )}
      {confirmed && <div className={styles.confirmedLabel}>{ts('alignment.confirmed')}</div>}
    </div>
  )
}
