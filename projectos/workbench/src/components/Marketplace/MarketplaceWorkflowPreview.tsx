import { useMemo, useState, type ReactNode } from 'react'
import type { IntentGraph } from '@contracts/index'
import { useI18n } from '../../i18n'
import TabBar from '../ui/TabBar'
import LoopGraphCanvasPreview from '../LoopGraph/LoopGraphCanvasPreview'
import { visualForIntentNode } from '../LoopGraph/loopNodeVisuals'
import { orderDraftNodesForPlan } from './marketplaceWorkflowPlan'
import styles from './MarketplaceWorkflowPreview.module.css'

type WorkflowDetailPage = 'graph' | 'plan' | 'details'

interface Props {
  draft: IntentGraph
  /** Original textual marketplace detail sections. */
  details: ReactNode
}

export default function MarketplaceWorkflowPreview({ draft, details }: Props) {
  const { ts } = useI18n()
  const [page, setPage] = useState<WorkflowDetailPage>('graph')
  const planNodes = useMemo(() => orderDraftNodesForPlan(draft), [draft])
  const goal = draft.graphPrompt.trim()

  const tabs = [
    { id: 'graph', label: ts('chat.marketplace.workflowPageGraph') },
    { id: 'plan', label: ts('chat.marketplace.workflowPagePlan') },
    { id: 'details', label: ts('chat.marketplace.workflowPageDetails') },
  ]

  return (
    <div className={styles.root}>
      <TabBar
        tabs={tabs}
        activeId={page}
        onChange={(id) => setPage(id as WorkflowDetailPage)}
        size="sm"
        chrome="nested"
      />

      {page === 'graph' ? (
        <section
          className={styles.graphPage}
          aria-label={ts('chat.marketplace.workflowPreviewGraph')}
        >
          <p className={styles.hint}>{ts('chat.marketplace.workflowPreviewGraphHint')}</p>
          <LoopGraphCanvasPreview
            className={styles.graphCanvas}
            draft={draft}
            emptyLabel={ts('chat.marketplace.workflowPreviewEmpty')}
            untitledNodeLabel={ts('chat.loopGraph.untitledNode')}
            edgeLabelPending={ts('chat.loopGraph.edgeLabelPending')}
            wiringProvidesLabel={ts('chat.loopGraph.wiringProvides')}
          />
        </section>
      ) : null}

      {page === 'plan' ? (
        <section
          className={styles.planPage}
          aria-label={ts('chat.marketplace.workflowPreviewPlan')}
        >
          <p className={styles.hint}>{ts('chat.marketplace.workflowPreviewPlanHint')}</p>

          {goal ? (
            <div className={styles.goalCard}>
              <div className={styles.goalLabel}>
                {ts('chat.marketplace.workflowPreviewGoal')}
              </div>
              <p className={styles.goalText}>{goal}</p>
            </div>
          ) : null}

          {planNodes.length === 0 ? (
            <p className={styles.emptyPlan}>{ts('chat.marketplace.workflowPreviewEmpty')}</p>
          ) : (
            <ol className={styles.planList}>
              {planNodes.map((node, index) => {
                const visual = visualForIntentNode(node)
                const NodeIcon = visual.Icon
                return (
                  <li key={node.id} className={styles.planItem}>
                    <span className={styles.planIndex} aria-hidden>
                      {index + 1}
                    </span>
                    <span className={styles.planIcon} title={visual.shortLabel} aria-hidden>
                      <NodeIcon size={14} strokeWidth={1.75} />
                    </span>
                    <div className={styles.planCopy}>
                      <div className={styles.planTitleRow}>
                        <span className={styles.planTitle}>
                          {node.title || visual.shortLabel}
                        </span>
                        <span className={styles.planRole}>{visual.shortLabel}</span>
                      </div>
                      {node.prompt.trim() ? (
                        <p className={styles.planPrompt}>{node.prompt}</p>
                      ) : null}
                    </div>
                  </li>
                )
              })}
            </ol>
          )}
        </section>
      ) : null}

      {page === 'details' ? (
        <section
          className={styles.detailsPage}
          aria-label={ts('chat.marketplace.workflowPageDetails')}
        >
          {details}
        </section>
      ) : null}
    </div>
  )
}
