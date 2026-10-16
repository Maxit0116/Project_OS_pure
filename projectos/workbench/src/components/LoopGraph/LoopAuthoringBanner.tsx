import { useEffect, useState } from 'react'
import type { IntentEdgeKind } from '@contracts/index'
import { useI18n } from '../../i18n'
import { useChatSessionStore } from '../../state/chatSessionStore'
import { findLoopAuthoringTarget } from '../../state/loopAuthoring'
import { useLoopGraphStore } from '../../state/loopGraphStore'
import styles from './LoopAuthoringBanner.module.css'

export default function LoopAuthoringBanner() {
  const { ts } = useI18n()
  const loopGraphOpen = useChatSessionStore((s) => s.loopGraphOpen)
  const activeSessionId = useChatSessionStore((s) => s.activeSessionId)
  const document = useLoopGraphStore((s) => s.document)
  const applying = useLoopGraphStore((s) => s.applying)
  const applyAuthoringFromActiveSession = useLoopGraphStore(
    (s) => s.applyAuthoringFromActiveSession,
  )
  const suggestEdgeKindForActiveSession = useLoopGraphStore(
    (s) => s.suggestEdgeKindForActiveSession,
  )

  const target = findLoopAuthoringTarget(document?.draft, activeSessionId)
  const [edgeKind, setEdgeKind] = useState<IntentEdgeKind>('depends')

  useEffect(() => {
    if (!target || target.type !== 'edge') return
    setEdgeKind(suggestEdgeKindForActiveSession() ?? target.kind ?? 'depends')
  }, [target, suggestEdgeKindForActiveSession])

  if (!loopGraphOpen || !target) return null

  const sourceTitle =
    target.type === 'edge'
      ? document?.draft.nodes.find((node) => node.id === target.source)?.title ?? target.source
      : ''
  const targetTitle =
    target.type === 'edge'
      ? document?.draft.nodes.find((node) => node.id === target.target)?.title ?? target.target
      : ''

  const label =
    target.type === 'node'
      ? ts('chat.loopGraph.authoringNode', { title: target.title })
      : ts('chat.loopGraph.authoringEdge', {
          source: sourceTitle,
          target: targetTitle,
        })

  return (
    <div className={styles.banner} data-loop-authoring-banner>
      <div className={styles.copy}>
        <strong>{ts('chat.loopGraph.authoringTitle')}</strong>
        <div>{label}</div>
      </div>
      {target.type === 'edge' ? (
        <div className={styles.kindGroup} role="group" aria-label={ts('chat.loopGraph.edgeKind')}>
          <button
            type="button"
            className={`${styles.kindButton} ${
              edgeKind === 'depends' ? styles.kindButtonActive : ''
            }`}
            onClick={() => setEdgeKind('depends')}
          >
            {ts('chat.loopGraph.edgeKindDepends')}
          </button>
          <button
            type="button"
            className={`${styles.kindButton} ${
              edgeKind === 'feedback' ? styles.kindButtonActive : ''
            }`}
            onClick={() => setEdgeKind('feedback')}
          >
            {ts('chat.loopGraph.edgeKindFeedback')}
          </button>
        </div>
      ) : null}
      <button
        type="button"
        className={styles.applyButton}
        disabled={applying}
        onClick={() =>
          void applyAuthoringFromActiveSession(
            target.type === 'edge' ? { edgeKind } : undefined,
          )
        }
      >
        {target.type === 'node'
          ? ts('chat.loopGraph.applyToNode')
          : ts('chat.loopGraph.applyToEdge')}
      </button>
    </div>
  )
}
