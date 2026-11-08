import { useMemo } from 'react'
import {
  ReactFlow,
  Background,
  ReactFlowProvider,
  type Node,
  type Edge,
} from '@xyflow/react'
import type { AgentFlowStep } from '@contracts/index'
import styles from './AgentFlowGraph.module.css'

interface Props {
  steps: AgentFlowStep[]
  status: string
  onSelectStep: (id: string) => void
}

const H_SPACING = 220

function FlowInner({ steps, onSelectStep }: Props) {
  const flowNodes: Node[] = useMemo(
    () =>
      steps.map((step, i) => ({
        id: step.id,
        position: { x: i * H_SPACING, y: 40 },
        data: { label: step.label, status: step.status },
        className: `${styles.node} ${
          step.status === 'running'
            ? styles.nodeRunning
            : step.status === 'complete'
              ? styles.nodeComplete
              : step.status === 'error'
                ? styles.nodeError
                : styles.nodePending
        }`,
        style: {
          padding: '10px 14px',
          borderRadius: 6,
          fontSize: 12,
          minWidth: 120,
          cursor: 'pointer',
        },
      })),
    [steps],
  )

  const flowEdges: Edge[] = useMemo(
    () =>
      steps.slice(0, -1).map((step, i) => ({
        id: `e-${step.id}`,
        source: step.id,
        target: steps[i + 1].id,
        animated: steps[i + 1].status === 'running',
        className: styles.edge,
      })),
    [steps],
  )

  return (
    <div className={styles.graph}>
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        onNodeClick={(_e, node) => onSelectStep(node.id)}
        fitView
        proOptions={{ hideAttribution: true }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
      >
        <Background color="var(--tech-border, #21262d)" gap={16} />
      </ReactFlow>
    </div>
  )
}

export default function AgentFlowGraph(props: Props) {
  return (
    <ReactFlowProvider>
      <FlowInner {...props} />
    </ReactFlowProvider>
  )
}
