import { useState } from 'react'
import type {
  FirstPrinciplesConflictResolution,
  FirstPrinciplesSession,
} from '@contracts/index'
import { useI18n } from '../../../i18n'
import Button from '../../ui/Button'
import TextArea from '../../ui/TextArea'
import refinementStyles from '../PromptRefinementCard.module.css'
import styles from './FirstPrinciples.module.css'

interface Props {
  session: FirstPrinciplesSession
  submitting?: boolean
  onResolve: (
    resolution: FirstPrinciplesConflictResolution,
    rephraseText?: string,
  ) => void
}

export default function FirstPrinciplesConflictCard({
  session,
  submitting = false,
  onResolve,
}: Props) {
  const { ts } = useI18n()
  const conflict = session.pendingConflict
  const [rephrase, setRephrase] = useState('')

  if (!conflict || session.status !== 'conflict') return null

  return (
    <div
      className={refinementStyles.card}
      data-testid="first-principles-conflict-card"
      style={{ ['--mode-color' as string]: 'var(--color-warning, #c9a227)' }}
    >
      <div className={refinementStyles.header}>
        <span className={refinementStyles.title}>{ts('firstPrinciples.conflict.title')}</span>
        <span className={refinementStyles.badge}>{session.currentLayerId}</span>
      </div>
      <p className={refinementStyles.explanation}>{conflict.summary}</p>

      <div className={styles.handoffBar}>
        <Button
          variant="secondary"
          disabled={submitting}
          onClick={() => onResolve('keep_left')}
        >
          {ts('firstPrinciples.conflict.keepLeft', { label: conflict.leftLabel })}
        </Button>
        <Button
          variant="secondary"
          disabled={submitting}
          onClick={() => onResolve('keep_right')}
        >
          {ts('firstPrinciples.conflict.keepRight', { label: conflict.rightLabel })}
        </Button>
      </div>

      <TextArea
        fieldClassName={styles.thesisField}
        id="fp-conflict-rephrase"
        label={ts('firstPrinciples.conflict.rephrase')}
        rows={2}
        value={rephrase}
        disabled={submitting}
        onChange={(event) => setRephrase(event.target.value)}
        placeholder={ts('firstPrinciples.conflict.rephrasePlaceholder')}
      />
      <div className={refinementStyles.actions}>
        <Button
          variant="mode"
          disabled={submitting || !rephrase.trim()}
          onClick={() => onResolve('rephrase', rephrase.trim())}
        >
          {ts('firstPrinciples.conflict.submitRephrase')}
        </Button>
      </div>

      {conflict.evidenceRefs && conflict.evidenceRefs.length > 0 ? (
        <div className={styles.reflect}>
          {ts('firstPrinciples.conflict.evidence')}: {conflict.evidenceRefs.join(' · ')}
        </div>
      ) : null}
    </div>
  )
}
