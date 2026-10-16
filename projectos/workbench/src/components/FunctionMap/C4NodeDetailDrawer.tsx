import { useEffect, useState } from 'react'
import type {
  CodeFileUnderstandingEntry,
  FileEntry,
  FileRelation,
  FunctionalEdge,
  FunctionalNode,
  ProjectGraph,
} from '@contracts/index'
import { X } from 'lucide-react'
import { useI18n } from '../../i18n'
import { useWorkbenchStore } from '../../state/workbenchStore'
import { isTrivialCodeDescription } from './codeFileDescription'
import {
  buildNodeUnderstanding,
  type ChangeRiskLevel,
} from './codeFileUnderstanding'
import { codeNodeDisplayTitle, codeNodeFilePath, isCodeElementNode } from './codeNodeInteraction'
import { nodeDetailCopy } from './nodeCopy'
import styles from './C4NodeDetailDrawer.module.css'

interface Props {
  node: FunctionalNode | null
  /** Projected layer nodes/edges (code_file_* live here). */
  layerNodes: FunctionalNode[]
  layerEdges: FunctionalEdge[]
  fileIndex: FileEntry[]
  fileRelations: FileRelation[]
  durableGraph: ProjectGraph | null
  onClose: () => void
}

function confidenceLabel(confidence: number): string {
  return `${Math.round(Math.max(0, Math.min(1, confidence)) * 100)}%`
}

function riskClass(risk: ChangeRiskLevel): string {
  if (risk === 'high') return styles.riskHigh
  if (risk === 'medium') return styles.riskMedium
  return styles.riskLow
}

export default function C4NodeDetailDrawer({
  node,
  layerNodes,
  layerEdges,
  fileIndex,
  fileRelations,
  durableGraph,
  onClose,
}: Props) {
  const { ts } = useI18n()
  const client = useWorkbenchStore((s) => s.client)
  const project = useWorkbenchStore((s) => s.project)
  const [llmUnderstanding, setLlmUnderstanding] =
    useState<CodeFileUnderstandingEntry | null>(null)
  const [llmLoading, setLlmLoading] = useState(false)
  const [llmError, setLlmError] = useState<string | null>(null)

  const isCodeNode = node ? isCodeElementNode(node) : false
  const filePath = node && isCodeNode ? codeNodeFilePath(node) : null

  useEffect(() => {
    if (!node || !isCodeNode || !filePath || !project) {
      setLlmUnderstanding(null)
      setLlmLoading(false)
      setLlmError(null)
      return
    }

    let cancelled = false
    setLlmLoading(true)
    setLlmError(null)
    setLlmUnderstanding(null)

    void client
      .ensureCodeFileUnderstanding(project.projectId, filePath)
      .then((entry) => {
        if (cancelled) return
        setLlmUnderstanding(entry)
        setLlmLoading(false)
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setLlmError(
          error instanceof Error ? error.message : ts('map.c4Detail.understandingFailed'),
        )
        setLlmLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [client, filePath, isCodeNode, node, project, ts])

  if (!node) return null

  const detail = nodeDetailCopy(node)
  const understanding = buildNodeUnderstanding({
    node,
    layerNodes,
    layerEdges,
    fileIndex,
    fileRelations,
    durableGraph,
  })
  const linked = node.linkedFiles.slice(0, 12)
  const title = understanding.isCodeNode ? codeNodeDisplayTitle(node) : node.name
  const usedByTitle = understanding.isCodeNode
    ? ts('map.c4Detail.usedBy')
    : ts('map.c4Detail.upstream')
  const dependsOnTitle = understanding.isCodeNode
    ? ts('map.c4Detail.dependsOn')
    : ts('map.c4Detail.downstream')

  const heuristicDescription = detail.description
  const showHeuristicDescription =
    !understanding.isCodeNode ||
    (!llmUnderstanding &&
      !llmLoading &&
      heuristicDescription &&
      !isTrivialCodeDescription(node, heuristicDescription))

  const descriptionText =
    llmUnderstanding?.description ??
    (showHeuristicDescription ? heuristicDescription : undefined)
  const roleText = llmUnderstanding?.role

  return (
    <aside
      className={styles.drawer}
      aria-label={ts('map.c4Detail.title')}
      data-testid="c4-node-detail-drawer"
    >
      <header className={styles.header}>
        <div className={styles.heading}>
          <h2 className={styles.title}>{title}</h2>
          <p className={styles.meta}>
            {[node.elementType, node.level, node.technology]
              .filter(Boolean)
              .join(' · ')}
          </p>
          {understanding.stereotype || understanding.fileType ? (
            <div className={styles.chips}>
              {understanding.stereotype ? (
                <span className={styles.chip}>{understanding.stereotype}</span>
              ) : null}
              {understanding.fileType ? (
                <span className={styles.chip}>
                  {ts(`map.fileTypes.${understanding.fileType}`)}
                </span>
              ) : null}
            </div>
          ) : null}
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
        {understanding.filePath ? (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>{ts('map.c4Detail.path')}</h3>
            <p className={`${styles.text} ${styles.path}`}>{understanding.filePath}</p>
          </section>
        ) : null}

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>{ts('map.c4Detail.description')}</h3>
          {llmLoading ? (
            <p className={styles.empty} data-testid="c4-detail-understanding-loading">
              {ts('map.c4Detail.understandingLoading')}
            </p>
          ) : descriptionText ? (
            <p className={styles.text}>{descriptionText}</p>
          ) : (
            <p className={styles.empty}>
              {llmError
                ? ts('map.c4Detail.understandingFailed')
                : ts('map.c4Detail.descriptionEmpty')}
            </p>
          )}
        </section>

        {understanding.isCodeNode ? (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>{ts('map.c4Detail.role')}</h3>
            {llmLoading ? (
              <p className={styles.empty}>{ts('map.c4Detail.understandingLoading')}</p>
            ) : roleText ? (
              <p className={styles.text}>{roleText}</p>
            ) : (
              <p className={styles.empty}>
                {llmError
                  ? ts('map.c4Detail.understandingFailed')
                  : ts('map.c4Detail.roleEmpty')}
              </p>
            )}
          </section>
        ) : detail.responsibility ? (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>{ts('map.c4Detail.responsibility')}</h3>
            <p className={styles.text}>{detail.responsibility}</p>
          </section>
        ) : null}

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>{ts('map.c4Detail.changeRisk')}</h3>
          <p className={`${styles.text} ${riskClass(understanding.changeRisk)}`}>
            {ts(`map.c4Detail.risk.${understanding.changeRisk}`)}
            {' · '}
            {ts('map.c4Detail.impactSummary', {
              dependents: String(understanding.impactDependentCount),
              dependencies: String(understanding.impactDependencyCount),
            })}
          </p>
        </section>

        {understanding.usedBy.length > 0 ? (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>{usedByTitle}</h3>
            <ul className={styles.list}>
              {understanding.usedBy.map((item) => (
                <li key={`used-${item.id}`}>{item.label}</li>
              ))}
            </ul>
          </section>
        ) : null}

        {understanding.dependsOn.length > 0 ? (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>{dependsOnTitle}</h3>
            <ul className={styles.list}>
              {understanding.dependsOn.map((item) => (
                <li key={`dep-${item.id}`}>{item.label}</li>
              ))}
            </ul>
          </section>
        ) : null}

        {!understanding.isCodeNode && understanding.impactViews.length > 0 ? (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>{ts('map.c4Detail.impactViews')}</h3>
            <ul className={styles.list}>
              {understanding.impactViews.map((viewKey) => (
                <li key={viewKey}>{viewKey}</li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>{ts('map.c4Detail.confidence')}</h3>
          <p className={styles.text}>{confidenceLabel(node.confidence)}</p>
        </section>

        {node.sourceKind ? (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>{ts('map.c4Detail.sourceKind')}</h3>
            <p className={styles.text}>{node.sourceKind}</p>
          </section>
        ) : null}

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

        {!understanding.isCodeNode && linked.length > 0 ? (
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
      </div>
    </aside>
  )
}
