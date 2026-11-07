import { LayoutTemplate } from 'lucide-react'
import { useI18n } from '../../i18n'
import {
  useWireframePackStore,
  type WireframePendingSummary,
} from '../../state/wireframePackStore'
import { useDiagramGraphStore } from '../../state/diagramGraphStore'
import Button from '../ui/Button'
import styles from '../DiagramGraph/DiagramSummaryCard.module.css'

export default function WireframePackSummaryCard({
  summary,
}: {
  summary: WireframePendingSummary
}) {
  const { ts } = useI18n()
  const enterWireframeMode = useDiagramGraphStore((s) => s.enterWireframeMode)
  const selectPack = useWireframePackStore((s) => s.selectPack)
  const clearPendingSummary = useWireframePackStore((s) => s.clearPendingSummary)

  return (
    <div className={styles.card} data-wireframe-pack-summary-card="">
      <div className={styles.head}>
        <LayoutTemplate size={16} aria-hidden />
        <div className={styles.copy}>
          <strong>{summary.title}</strong>
          <span>
            {summary.status}
            {summary.version > 0 ? ` v${summary.version}` : ''} · {summary.screenCount}{' '}
            {ts('chat.wireframePack.screens')}
          </span>
        </div>
      </div>
      <p className={styles.prompt}>{summary.prompt}</p>
      <div className={styles.actions}>
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={() => {
            enterWireframeMode()
            void selectPack(summary.packId)
          }}
        >
          {ts('chat.wireframePack.open')}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={clearPendingSummary}>
          {ts('chat.wireframePack.dismissSummary')}
        </Button>
      </div>
    </div>
  )
}
