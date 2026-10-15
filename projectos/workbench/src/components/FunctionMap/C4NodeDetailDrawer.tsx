import type { FunctionalEdge, FunctionalNode } from '@contracts/index'
import { X } from 'lucide-react'
import { useI18n } from '../../i18n'
import { nodeDetailCopy } from './nodeCopy'
import styles from './C4NodeDetailDrawer.module.css'

interface Props {
  node: FunctionalNode | null
  edges: FunctionalEdge[]
  onClose: () => void
}

function confidenceLabel(confidence: number): string {
  return `${Math.round(Math.max(0, Math.min(1, confidence)) * 100)}%`
}

export default function C4NodeDetailDrawer({ node, edges, onClose }: Props) {
  const { ts } = useI18n()
  if (!node) return null

  const upstream = edges.filter((edge) => edge.target === node.id)
  const downstream = edges.filter((edge) => edge.source === node.id)
  const linked = node.linkedFiles.slice(0, 12)
  const detail = nodeDetailCopy(node)

  return (
    <aside
      className={styles.drawer}
      aria-label={ts('map.c4Detail.title')}
      data-testid="c4-node-detail-drawer"
    >
      <header className={styles.header}>
        <div className={styles.heading}>
          <h2 className={styles.title}>{node.name}</h2>
          <p className={styles.meta}>
            {[node.elementType, node.level, node.technology]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <button
          type="button"
          className={`${styles.close} tech-focus`}
          onClick={onClose}
          aria-label={ts('map.c4Detail.close')}
        >
          <X size={16} aria-hidden />
        </button>
      </header>

      <div className={styles.body}>
        {detail.description ? (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>{ts('map.c4Detail.description')}</h3>
            <p className={styles.text}>{detail.description}</p>
          </section>
        ) : null}

        {detail.responsibility ? (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>{ts('map.c4Detail.responsibility')}</h3>
            <p className={styles.text}>{detail.responsibility}</p>
          </section>
        ) : null}

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>{ts('map.c4Detail.confidence')}</h3>
          <p className={styles.text}>{confidenceLabel(node.confidence)}</p>
        </section>

        {node.owners && node.owners.length > 0 ? (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>{ts('map.c4Detail.owners')}</h3>
            <ul className={styles.list}>
              {node.owners.map((owner) => (
                <li key={owner}>{owner}</li>
              ))}
            </ul>
          </section>
        ) : null}

        {node.notes ? (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>{ts('map.c4Detail.notes')}</h3>
            <p className={styles.text}>{node.notes}</p>
          </section>
        ) : null}

        {node.openQuestions && node.openQuestions.length > 0 ? (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>{ts('map.c4Detail.openQuestions')}</h3>
            <ul className={styles.list}>
              {node.openQuestions.map((question) => (
                <li key={question}>{question}</li>
              ))}
            </ul>
          </section>
        ) : null}

        {linked.length > 0 ? (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>{ts('map.c4Detail.linkedFiles')}</h3>
            <ul className={styles.list}>
              {linked.map((file) => (
                <li key={file.path} className={styles.path}>
                  {file.path}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {upstream.length > 0 ? (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>{ts('map.c4Detail.upstream')}</h3>
            <ul className={styles.list}>
              {upstream.map((edge) => (
                <li key={edge.id}>
                  {edge.source}
                  {edge.technology ? ` [${edge.technology}]` : ''}
                  {edge.label ? ` — ${edge.label}` : ''}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {downstream.length > 0 ? (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>{ts('map.c4Detail.downstream')}</h3>
            <ul className={styles.list}>
              {downstream.map((edge) => (
                <li key={edge.id}>
                  {edge.target}
                  {edge.technology ? ` [${edge.technology}]` : ''}
                  {edge.label ? ` — ${edge.label}` : ''}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </aside>
  )
}
