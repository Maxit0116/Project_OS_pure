import type { DebugSession } from '@contracts/index'
import { useI18n } from '../../i18n'
import Button from '../ui/Button'
import HypothesisCard from '../DebugHarness/HypothesisCard'
import styles from './DebugSessionPanel.module.css'

interface Props {
  session: DebugSession
  fixInProgress: boolean
  onReproduced: () => void
  onConfirmFix: () => void
  onMarkFixed: () => void
}

const PHASES = [
  'hypothesize',
  'instrument',
  'reproduce',
  'analyze',
  'fix',
  'verify',
  'cleanup',
  'complete',
] as const

export default function DebugSessionPanel({
  session,
  fixInProgress,
  onReproduced,
  onConfirmFix,
  onMarkFixed,
}: Props) {
  const { ts } = useI18n()
  const phaseIndex = PHASES.indexOf(session.phase)

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <h3>{ts('debug.title')}</h3>
        <span className={styles.phase}>{ts(`debug.phase.${session.phase}`)}</span>
      </div>

      <div className={styles.progress}>
        {PHASES.map((phase, index) => (
          <span
            key={phase}
            className={`${styles.progressStep} ${index <= phaseIndex ? styles.progressActive : ''}`}
          >
            {ts(`debug.phase.${phase}`)}
          </span>
        ))}
      </div>

      <section className={styles.section}>
        <h4>{ts('debug.bugDescription')}</h4>
        <p>{session.bugDescription}</p>
      </section>

      {session.reproSteps.length > 0 && (
        <section className={styles.section}>
          <h4>{ts('debug.reproSteps')}</h4>
          <ol>
            {session.reproSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </section>
      )}

      {session.hypotheses.length > 0 && (
        <section className={styles.section}>
          <h4>{ts('debug.hypotheses')}</h4>
          {session.hypotheses.map((hypothesis) => (
            <HypothesisCard
              key={hypothesis.id}
              hypothesis={hypothesis}
              isChosen={hypothesis.id === session.chosenRootCauseId}
            />
          ))}
        </section>
      )}

      {session.proposedFix && (
        <section className={styles.section}>
          <h4>{ts('debug.proposedFix')}</h4>
          <p>{session.proposedFix.summary}</p>
        </section>
      )}

      <div className={styles.actions}>
        {session.phase === 'hypothesize' && (
          <Button onClick={onReproduced}>{ts('debug.continueToReproduce')}</Button>
        )}
        {session.phase === 'reproduce' && (
          <Button onClick={onReproduced}>{ts('debug.reproduced')}</Button>
        )}
        {session.phase === 'fix' && (
          <Button onClick={onConfirmFix} disabled={fixInProgress}>
            {ts('debug.applyFix')}
          </Button>
        )}
        {session.phase === 'verify' && (
          <Button onClick={onMarkFixed}>{ts('debug.markFixed')}</Button>
        )}
      </div>
    </div>
  )
}
