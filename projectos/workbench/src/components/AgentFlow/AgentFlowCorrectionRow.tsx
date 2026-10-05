import { MessageSquareWarning } from 'lucide-react'
import type { FlowCorrection } from '../../state/workbenchStore'
import { useI18n } from '../../i18n'
import styles from './AgentFlowCorrectionRow.module.css'

interface Props {
  correction: FlowCorrection
  index: number
}

export default function AgentFlowCorrectionRow({ correction, index }: Props) {
  const { ts } = useI18n()

  return (
    <div className={styles.wrapper} data-correction style={{ animationDelay: `${index * 50}ms` }}>
      <div className={styles.marker}>
        <MessageSquareWarning size={14} aria-hidden />
        <span className={styles.badge}>{ts('agentFlow.correctionMarker')}</span>
      </div>
      <p className={styles.message}>{correction.message}</p>
    </div>
  )
}
