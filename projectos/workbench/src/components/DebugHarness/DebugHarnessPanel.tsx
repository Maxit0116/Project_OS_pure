import { useState } from 'react'
import type { HarnessRecord } from '@contracts/index'
import { useI18n } from '../../i18n'
import Button from '../ui/Button'
import HypothesisCard from './HypothesisCard'
import styles from './DebugHarnessPanel.module.css'

interface Props {
  record: HarnessRecord
  onStartFix: () => void
  fixStarted: boolean
}

export default function DebugHarnessPanel({ record, onStartFix, fixStarted }: Props) {
  const chosen = record.hypotheses.find((h) => h.id === record.chosenRootCauseId)
  const { ts } = useI18n()
  const [evidenceOpen, setEvidenceOpen] = useState(false)

  return (
    <div className={styles.panel}>
      {chosen && (
        <section className={styles.summaryCard}>
          <h3>{ts('harness.rootCauseSummary')}</h3>
          <p>{chosen.summary}</p>
        </section>
      )}

      <section className={styles.section}>
        <button type="button" className={styles.sectionToggle} onClick={() => setEvidenceOpen((o) => !o)}>
          {evidenceOpen ? '▾' : '▸'} {ts('harness.evidence')}
        </button>
        {evidenceOpen && (
          <>
            <pre className={styles.error}>{record.rawError}</pre>
            <div className={styles.meta}>
              <span>{ts('harness.businessNode')}: {record.businessNodeId}</span>
              <span>{ts('harness.files')}: {record.technicalFiles.join(', ')}</span>
            </div>
          </>
        )}
      </section>

      <section className={styles.section}>
        <h3>{ts('harness.hypotheses')}</h3>
        {record.hypotheses.map((h) => (
          <HypothesisCard
            key={h.id}
            hypothesis={h}
            isChosen={h.id === record.chosenRootCauseId}
          />
        ))}
      </section>

      <section className={styles.section}>
        <h3>{ts('harness.proposedFix')}</h3>
        <p>{record.proposedFix.summary}</p>
        <div className={styles.chips}>
          {record.proposedFix.touchedFiles.map((f) => (
            <span key={f} className={styles.chip}>{f}</span>
          ))}
        </div>
        <span className={styles.patchKind}>{record.proposedFix.patchKind.replace(/_/g, ' ')}</span>
      </section>

      {chosen && (
        <section className={styles.section}>
          <h3>{ts('harness.rootCause')}</h3>
          <p className={styles.rootCause}>{chosen.summary}</p>
        </section>
      )}

      <section className={styles.section}>
        <h3>{ts('harness.verification')}</h3>
        <p className={styles.verification}>
          Status: <strong>{record.verification.status}</strong>
        </p>
        {record.verification.outputSummary && (
          <p className={styles.verifyOutput}>{record.verification.outputSummary}</p>
        )}
      </section>

      {!fixStarted && record.verification.status === 'not_run' && (
        <Button onClick={onStartFix}>{ts('harness.startFix')}</Button>
      )}
    </div>
  )
}
