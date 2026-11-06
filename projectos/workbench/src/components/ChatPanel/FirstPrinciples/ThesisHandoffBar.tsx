import type { FirstPrinciplesHandoffTarget, FirstPrinciplesSession } from '@contracts/index'
import { useI18n } from '../../../i18n'
import Button from '../../ui/Button'
import styles from './FirstPrinciples.module.css'

interface Props {
  session: FirstPrinciplesSession
  busy?: boolean
  onHandoff: (target: FirstPrinciplesHandoffTarget) => void
}

export default function ThesisHandoffBar({ session, busy, onHandoff }: Props) {
  const { ts } = useI18n()
  if (session.status !== 'concluded' || !session.thesis) return null
  const go = session.thesis.verdict === 'go'

  return (
    <div className={styles.handoffBar} data-testid="first-principles-handoff">
      {go ? (
        <>
          <Button variant="mode" disabled={busy} onClick={() => onHandoff('plan')}>
            {ts('firstPrinciples.handoff.plan')}
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => onHandoff('agent')}>
            {ts('firstPrinciples.handoff.agent')}
          </Button>
        </>
      ) : null}
      <Button variant="secondary" disabled={busy} onClick={() => onHandoff('ask_chat')}>
        {ts('firstPrinciples.handoff.ask')}
      </Button>
    </div>
  )
}
