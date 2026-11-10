import { useEffect, useState } from 'react'
import type { SessionRouteAction, SessionRouteSuggestion } from '@contracts/index'
import { useI18n } from '../../i18n'
import { useSessionRouteStore } from '../../state/sessionRouteStore'
import styles from './SessionRoutePreview.module.css'

interface Props {
  suggestion: SessionRouteSuggestion
}

export default function SessionRoutePreview({ suggestion }: Props) {
  const { ts } = useI18n()
  const clearPreview = useSessionRouteStore((s) => s.clearPreview)
  const applyActionOverride = useSessionRouteStore((s) => s.applyActionOverride)
  const [action, setAction] = useState<SessionRouteAction>(suggestion.action)
  const [targetId, setTargetId] = useState(suggestion.targetSessionId)

  useEffect(() => {
    setAction(suggestion.action)
    setTargetId(suggestion.targetSessionId)
  }, [suggestion])

  const selected =
    suggestion.alternatives.find((item) => item.sessionId === targetId) ??
    suggestion.alternatives[0]

  return (
    <div className={styles.card} role="status" aria-live="polite">
      <div className={styles.header}>
        <span className={styles.badge}>{ts(`chat.sessionRoute.action.${action}`)}</span>
        <span className={styles.confidence}>
          {ts(`chat.sessionRoute.confidence.${suggestion.confidence}`)}
        </span>
      </div>
      <div className={styles.title}>{selected?.title ?? suggestion.title}</div>
      <div className={styles.reasons}>
        {(selected?.reasons ?? suggestion.reasons).map((reason) => (
          <span key={reason} className={styles.chip}>
            {ts(`chat.sessionRoute.reason.${reason}`)}
          </span>
        ))}
      </div>
      {suggestion.alternatives.length > 0 ? (
        <label className={styles.altLabel}>
          <span>{ts('chat.sessionRoute.pickAlternative')}</span>
          <select
            className={styles.select}
            value={targetId}
            onChange={(event) => setTargetId(event.target.value)}
          >
            {suggestion.alternatives.map((alt) => (
              <option key={alt.sessionId} value={alt.sessionId}>
                {alt.title}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label className={styles.altLabel}>
        <span>{ts('chat.sessionRoute.actionLabel')}</span>
        <select
          className={styles.select}
          value={action}
          onChange={(event) => setAction(event.target.value as SessionRouteAction)}
        >
          <option value="stay">{ts('chat.sessionRoute.action.stay')}</option>
          <option value="switch">{ts('chat.sessionRoute.action.switch')}</option>
          <option value="branch">{ts('chat.sessionRoute.action.branch')}</option>
        </select>
      </label>
      <div className={styles.actions}>
        <button type="button" className={styles.secondary} onClick={() => clearPreview()}>
          {ts('chat.sessionRoute.cancel')}
        </button>
        <button
          type="button"
          className={styles.primary}
          onClick={() => void applyActionOverride(suggestion, action, targetId)}
        >
          {ts('chat.sessionRoute.confirm')}
        </button>
      </div>
      <p className={styles.hint}>{ts('chat.sessionRoute.sendHint')}</p>
    </div>
  )
}
