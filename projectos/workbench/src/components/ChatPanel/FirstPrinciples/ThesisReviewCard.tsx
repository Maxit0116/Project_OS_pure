import { useEffect, useState } from 'react'
import type {
  FirstPrinciplesSession,
  FirstPrinciplesThesis,
  FirstPrinciplesVerdict,
} from '@contracts/index'
import { useI18n } from '../../../i18n'
import Button from '../../ui/Button'
import TextArea from '../../ui/TextArea'
import TextInput from '../../ui/TextInput'
import refinementStyles from '../PromptRefinementCard.module.css'
import styles from './FirstPrinciples.module.css'

interface Props {
  session: FirstPrinciplesSession
  submitting?: boolean
  onConfirm: (
    thesis: FirstPrinciplesThesis,
    acknowledgeLowConfidence: boolean,
    writePlannedFeature: boolean,
  ) => void
  onPivot: () => void
}

const VERDICTS: FirstPrinciplesVerdict[] = ['go', 'pivot', 'kill', 'park']

export default function ThesisReviewCard({
  session,
  submitting = false,
  onConfirm,
  onPivot,
}: Props) {
  const { ts } = useI18n()
  const [thesis, setThesis] = useState<FirstPrinciplesThesis | null>(session.thesis ?? null)
  const [ackLow, setAckLow] = useState(false)
  const [writeFeature, setWriteFeature] = useState(true)

  useEffect(() => {
    setThesis(session.thesis ?? null)
  }, [session.thesis, session.id])

  if (!thesis || (session.status !== 'thesis_review' && session.status !== 'concluded')) {
    return null
  }

  const concluded = session.status === 'concluded'
  const needsLowAck = thesis.verdict === 'go' && thesis.confidence <= 2
  const canConfirm =
    thesis.title.trim() &&
    thesis.thesis.trim() &&
    thesis.forWhom.trim() &&
    thesis.mvp.trim() &&
    thesis.successSignal.trim() &&
    (!needsLowAck || ackLow)

  const patch = <K extends keyof FirstPrinciplesThesis>(key: K, value: FirstPrinciplesThesis[K]) => {
    setThesis((current) => (current ? { ...current, [key]: value } : current))
  }

  return (
    <div
      className={`${refinementStyles.card} ${concluded ? refinementStyles.confirmed : ''}`}
      data-testid="first-principles-thesis-card"
      style={{ ['--mode-color' as string]: 'var(--color-mode-ask, var(--tech-accent))' }}
    >
      <div className={refinementStyles.header}>
        <span className={refinementStyles.title}>{ts('firstPrinciples.thesis.title')}</span>
        <span className={styles.verdictBadge}>
          {ts(`firstPrinciples.verdict.${thesis.verdict}` as 'firstPrinciples.verdict.go')}
        </span>
      </div>
      <p className={refinementStyles.explanation}>{ts('firstPrinciples.thesis.intro')}</p>

      {(
        [
          ['title', 'firstPrinciples.thesis.fieldTitle'],
          ['thesis', 'firstPrinciples.thesis.fieldThesis'],
          ['forWhom', 'firstPrinciples.thesis.fieldForWhom'],
          ['whyNow', 'firstPrinciples.thesis.fieldWhyNow'],
          ['mvp', 'firstPrinciples.thesis.fieldMvp'],
          ['successSignal', 'firstPrinciples.thesis.fieldSuccess'],
        ] as const
      ).map(([key, labelKey]) =>
        key === 'thesis' || key === 'mvp' || key === 'whyNow' ? (
          <TextArea
            key={key}
            fieldClassName={styles.thesisField}
            id={`fp-thesis-${key}`}
            label={ts(labelKey)}
            rows={2}
            value={thesis[key]}
            disabled={concluded || submitting}
            onChange={(event) => patch(key, event.target.value)}
          />
        ) : (
          <TextInput
            key={key}
            fieldClassName={styles.thesisField}
            id={`fp-thesis-${key}`}
            label={ts(labelKey)}
            value={thesis[key]}
            disabled={concluded || submitting}
            onChange={(event) => patch(key, event.target.value)}
          />
        ),
      )}

      <TextArea
        fieldClassName={styles.thesisField}
        id="fp-thesis-nongoals"
        label={ts('firstPrinciples.thesis.fieldNonGoals')}
        rows={2}
        value={thesis.nonGoals.join('\n')}
        disabled={concluded || submitting}
        onChange={(event) =>
          patch(
            'nonGoals',
            event.target.value
              .split('\n')
              .map((line) => line.trim())
              .filter(Boolean),
          )
        }
      />

      <div className={styles.thesisField}>
        <label htmlFor="fp-thesis-verdict">{ts('firstPrinciples.thesis.fieldVerdict')}</label>
        <select
          id="fp-thesis-verdict"
          value={thesis.verdict}
          disabled={concluded || submitting}
          onChange={(event) => patch('verdict', event.target.value as FirstPrinciplesVerdict)}
        >
          {VERDICTS.map((verdict) => (
            <option key={verdict} value={verdict}>
              {ts(`firstPrinciples.verdict.${verdict}` as 'firstPrinciples.verdict.go')}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.thesisField}>
        <label htmlFor="fp-thesis-confidence">{ts('firstPrinciples.thesis.fieldConfidence')}</label>
        <select
          id="fp-thesis-confidence"
          value={thesis.confidence}
          disabled={concluded || submitting}
          onChange={(event) =>
            patch('confidence', Number(event.target.value) as FirstPrinciplesThesis['confidence'])
          }
        >
          {[1, 2, 3, 4, 5].map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </div>

      {needsLowAck && !concluded ? (
        <label className={styles.reflect}>
          <input
            type="checkbox"
            checked={ackLow}
            onChange={(event) => setAckLow(event.target.checked)}
          />{' '}
          {ts('firstPrinciples.lowConfidenceConfirm')}
        </label>
      ) : null}

      {!concluded && thesis.verdict === 'go' ? (
        <label className={styles.reflect}>
          <input
            type="checkbox"
            checked={writeFeature}
            onChange={(event) => setWriteFeature(event.target.checked)}
          />{' '}
          {ts('firstPrinciples.thesis.writeFeature')}
        </label>
      ) : null}

      {concluded && session.featuresFeatureId ? (
        <p className={styles.reflect}>
          {ts('firstPrinciples.thesis.featureWritten', { id: session.featuresFeatureId })}
        </p>
      ) : null}

      {!concluded ? (
        <div className={refinementStyles.actions}>
          <Button
            variant="mode"
            disabled={!canConfirm || submitting}
            onClick={() => onConfirm(thesis, ackLow, writeFeature && thesis.verdict === 'go')}
          >
            {ts('firstPrinciples.thesis.confirm')}
          </Button>
          <Button variant="secondary" disabled={submitting} onClick={onPivot}>
            {ts('firstPrinciples.thesis.pivot')}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
