import { LayoutTemplate, Network } from 'lucide-react'
import { useI18n } from '../../i18n'
import {
  useDiagramGraphStore,
  type DiagramPendingSummary,
} from '../../state/diagramGraphStore'
import { useChatSessionStore } from '../../state/chatSessionStore'
import Button from '../ui/Button'
import styles from './DiagramSummaryCard.module.css'

export default function DiagramSummaryCard({
  summary,
}: {
  summary: DiagramPendingSummary
}) {
  const { ts } = useI18n()
  const setDiagramGraphOpen = useChatSessionStore((s) => s.setDiagramGraphOpen)
  const selectArtifact = useDiagramGraphStore((s) => s.selectArtifact)
  const enterWireframeMode = useDiagramGraphStore((s) => s.enterWireframeMode)
  const requestRegenerate = useDiagramGraphStore((s) => s.requestRegenerate)
  const clearPendingSummary = useDiagramGraphStore((s) => s.clearPendingSummary)
  const isWireframe = summary.visualType === 'ui-wireframe' || Boolean(summary.packId)

  return (
    <div className={styles.card} data-diagram-summary-card="">
      <div className={styles.head}>
        {isWireframe ? (
          <LayoutTemplate size={16} aria-hidden />
        ) : (
          <Network size={16} aria-hidden />
        )}
        <div className={styles.copy}>
          <strong>{summary.title}</strong>
          <span>{summary.visualType}</span>
        </div>
      </div>
      <p className={styles.prompt}>{summary.prompt}</p>
      <div className={styles.actions}>
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={() => {
            if (isWireframe) {
              enterWireframeMode()
              if (summary.packId) {
                void import('../../state/wireframePackStore').then(
                  ({ useWireframePackStore }) => {
                    void useWireframePackStore.getState().selectPack(summary.packId!)
                  },
                )
              }
              return
            }
            setDiagramGraphOpen(true)
            void selectArtifact(summary.artifactId)
          }}
        >
          {isWireframe ? ts('chat.wireframePack.open') : ts('chat.diagramGraph.open')}
        </Button>
        {isWireframe ? null : (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              setDiagramGraphOpen(true)
              requestRegenerate()
            }}
          >
            {ts('chat.diagramGraph.regenerate')}
          </Button>
        )}
        <Button type="button" variant="ghost" size="sm" onClick={clearPendingSummary}>
          {ts('chat.diagramGraph.dismissSummary')}
        </Button>
      </div>
    </div>
  )
}
