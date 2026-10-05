import { useState } from 'react'
import type { AgentFlowStep } from '@contracts/index'
import type { FlowCorrection } from '../../state/workbenchStore'
import { useWorkbenchStore } from '../../state/workbenchStore'
import { useI18n } from '../../i18n'
import Chip from '../ui/Chip'
import Button from '../ui/Button'
import styles from './AgentFlowStepDetail.module.css'

interface Props {
  step: AgentFlowStep
  corrections: FlowCorrection[]
  onClose: () => void
}

export default function AgentFlowStepDetail({ step, corrections, onClose }: Props) {
  const selectFile = useWorkbenchStore((s) => s.selectFile)
  const injectFlowCorrection = useWorkbenchStore((s) => s.injectFlowCorrection)
  const { ts } = useI18n()
  const [correction, setCorrection] = useState('')

  const handleSubmitCorrection = () => {
    if (!correction.trim()) return
    void injectFlowCorrection(step.id, correction.trim())
    setCorrection('')
  }

  return (
    <aside className={styles.panel}>
      <div className={styles.header}>
        <h3>{ts('agentFlow.stepDetail')}</h3>
        <button type="button" className={styles.close} onClick={onClose}>×</button>
      </div>
      <div className={styles.body}>
        <p className={styles.label}>{step.label}</p>
        <p className={styles.kind}>{step.kind.replace(/_/g, ' ')}</p>
        {step.outputSummary && <p className={styles.summary}>{step.outputSummary}</p>}
        {step.relatedFiles.length > 0 && (
          <div className={styles.files}>
            {step.relatedFiles.map((f) => (
              <Chip key={f} onClick={() => selectFile(f)}>{f}</Chip>
            ))}
          </div>
        )}
        {corrections.length > 0 && (
          <div className={styles.correctionHistory}>
            <span className={styles.correctionLabel}>{ts('agentFlow.correctionHistory')}</span>
            <ul>
              {corrections.map((c) => (
                <li key={c.id}>{c.message}</li>
              ))}
            </ul>
          </div>
        )}
        <div className={styles.correction}>
          <label className={styles.correctionLabel}>{ts('agentFlow.correction')}</label>
          <textarea
            className={styles.correctionInput}
            value={correction}
            onChange={(e) => setCorrection(e.target.value)}
            placeholder={ts('agentFlow.correctionPlaceholder')}
            rows={2}
          />
          <Button size="sm" onClick={handleSubmitCorrection}>
            {ts('agentFlow.submitCorrection')}
          </Button>
        </div>
      </div>
    </aside>
  )
}
