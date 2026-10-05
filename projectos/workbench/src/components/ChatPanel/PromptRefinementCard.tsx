import type { PromptRefinement } from '@contracts/index'
import { useI18n } from '../../i18n'
import Button from '../ui/Button'
import styles from './PromptRefinementCard.module.css'

interface Props {
  refinement: PromptRefinement
  targetFile: string | null
  confirmed: boolean
  onConfirm: () => void
  onRevise: () => void
}

export default function PromptRefinementCard({
  refinement,
  targetFile,
  confirmed,
  onConfirm,
  onRevise,
}: Props) {
  const { ts } = useI18n()

  return (
    <div className={`${styles.card} fade-slide-up ${confirmed ? styles.confirmed : ''}`} data-tour="refinement">
      <div className={styles.header}>
        <span className={styles.title}>{ts('refinement.title')}</span>
        <span className={styles.badge}>
          {refinement.mode === 'deterministic_fixture' ? ts('refinement.demo') : ts('refinement.model')}
        </span>
      </div>
      <p className={styles.explanation}>{ts('refinement.explanation')}</p>

      <section className={styles.section}>
        <h4>{ts('refinement.understood')}</h4>
        <p>{refinement.understood}</p>
      </section>

      {refinement.ambiguities.length > 0 && (
        <section className={styles.section}>
          <h4>{ts('refinement.ambiguities')}</h4>
          <ul>
            {refinement.ambiguities.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </section>
      )}

      {refinement.suggestions.length > 0 && (
        <section className={styles.section}>
          <h4>{ts('refinement.suggestions')}</h4>
          <ul className={styles.suggestions}>
            {refinement.suggestions.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </section>
      )}

      {targetFile && (
        <section className={styles.section} data-refinement-section="target-file">
          <h4>{ts('refinement.targetFile')}</h4>
          <div className={styles.chips}>
            <span className={styles.chip}>{targetFile}</span>
          </div>
        </section>
      )}

      {refinement.affectedFiles.length > 0 && (
        <section className={styles.section} data-refinement-section="related-files">
          <h4>{ts('refinement.affectedFiles')}</h4>
          <p className={styles.sectionHelp}>{ts('refinement.affectedFilesHelp')}</p>
          <div className={styles.chips}>
            {refinement.affectedFiles.map((f) => (
              <span key={f} className={styles.chip}>{f}</span>
            ))}
          </div>
        </section>
      )}

      {!confirmed && (
        <div className={styles.actions}>
          <Button onClick={onConfirm}>{ts('refinement.confirmRun')}</Button>
          <Button variant="secondary" onClick={onRevise}>{ts('refinement.reviseRequest')}</Button>
        </div>
      )}
      {confirmed && <div className={styles.confirmedLabel}>{ts('refinement.confirmed')}</div>}
    </div>
  )
}
