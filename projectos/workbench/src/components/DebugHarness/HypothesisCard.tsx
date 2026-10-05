import styles from './HypothesisCard.module.css'

interface Props {
  hypothesis: {
    id: string
    summary: string
    confidence: number
    evidence: string[]
    rejected?: boolean
    rejectionReason?: string
  }
  isChosen: boolean
}

export default function HypothesisCard({ hypothesis, isChosen }: Props) {
  return (
    <div
      className={`${styles.card} ${hypothesis.rejected ? styles.rejected : ''} ${isChosen ? styles.chosen : ''}`}
    >
      <div className={styles.header}>
        <span className={styles.summary}>{hypothesis.summary}</span>
        <span className={styles.confidence}>{Math.round(hypothesis.confidence * 100)}%</span>
      </div>
      {hypothesis.rejected && (
        <div className={styles.rejectedLabel}>
          Rejected: {hypothesis.rejectionReason}
        </div>
      )}
      {isChosen && <div className={styles.chosenLabel}>Chosen root cause</div>}
      <ul className={styles.evidence}>
        {hypothesis.evidence.map((e) => (
          <li key={e}>{e}</li>
        ))}
      </ul>
    </div>
  )
}
