import type { SessionContextDigest } from '@contracts/index'
import { useI18n } from '../../i18n'
import styles from './InheritedSessionCard.module.css'

export default function InheritedSessionCard({ digest }: { digest: SessionContextDigest }) {
  const { ts } = useI18n()
  return (
    <aside className={styles.card} aria-label={ts('chat.sessionGraph.inherited')}>
      <p className={styles.label}>{ts('chat.sessionGraph.inherited')}</p>
      <p className={styles.responsibility}>{digest.responsibility}</p>
      {digest.decisions.length > 0 ? (
        <p className={styles.line}>
          <span>{ts('chat.sessionGraph.decisions')}</span> {digest.decisions.join(' · ')}
        </p>
      ) : null}
      {digest.openQuestions.length > 0 ? (
        <p className={styles.line}>
          <span>{ts('chat.sessionGraph.openQuestions')}</span> {digest.openQuestions.join(' · ')}
        </p>
      ) : null}
      {digest.refs.length > 0 ? (
        <p className={styles.line}>
          <span>{ts('chat.sessionGraph.refs')}</span> {digest.refs.join(', ')}
        </p>
      ) : null}
    </aside>
  )
}
