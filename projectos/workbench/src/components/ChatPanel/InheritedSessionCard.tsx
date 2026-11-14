import { useId, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { SessionContextDigest } from '@contracts/index'
import { useI18n } from '../../i18n'
import styles from './InheritedSessionCard.module.css'

export default function InheritedSessionCard({ digest }: { digest: SessionContextDigest }) {
  const { ts } = useI18n()
  const [expanded, setExpanded] = useState(false)
  const detailsId = useId()

  const hasDecisions = digest.decisions.length > 0
  const hasOpenQuestions = digest.openQuestions.length > 0
  const hasRefs = digest.refs.length > 0
  const hasDetails = hasDecisions || hasOpenQuestions || hasRefs
  const toggleLabel = expanded
    ? ts('chat.sessionGraph.collapseInherited')
    : ts('chat.sessionGraph.expandInherited')

  return (
    <aside className={styles.card} aria-label={ts('chat.sessionGraph.inherited')}>
      <div className={styles.header}>
        <p className={styles.responsibility}>{digest.responsibility}</p>
        {hasDetails ? (
          <button
            type="button"
            className={styles.toggle}
            onClick={() => setExpanded((value) => !value)}
            aria-expanded={expanded}
            aria-controls={detailsId}
            aria-label={toggleLabel}
            title={toggleLabel}
          >
            <ChevronDown
              size={14}
              strokeWidth={1.75}
              className={expanded ? styles.chevronOpen : styles.chevron}
              aria-hidden
            />
          </button>
        ) : null}
      </div>

      {hasDetails && expanded ? (
        <div id={detailsId} className={styles.details}>
          {hasDecisions ? (
            <p className={styles.line}>
              <span>{ts('chat.sessionGraph.decisions')}</span> {digest.decisions.join(' · ')}
            </p>
          ) : null}
          {hasOpenQuestions ? (
            <p className={styles.line}>
              <span>{ts('chat.sessionGraph.openQuestions')}</span>{' '}
              {digest.openQuestions.join(' · ')}
            </p>
          ) : null}
          {hasRefs ? (
            <p className={styles.line}>
              <span>{ts('chat.sessionGraph.refs')}</span> {digest.refs.join(', ')}
            </p>
          ) : null}
        </div>
      ) : null}
    </aside>
  )
}
