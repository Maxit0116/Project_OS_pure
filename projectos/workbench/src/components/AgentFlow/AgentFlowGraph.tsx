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
        style: {
          padding: '10px 14px',
          borderRadius: 8,
          border: `2px solid ${
            step.status === 'running' ? '#d29922' :
            step.status === 'complete' ? '#3fb950' :
            step.status === 'error' ? '#f85149' : '#30363d'
          }`,
          background: '#161b22',
          color: '#e6edf3',
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
        style: { stroke: '#58a6ff' },
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
        <Background color="#21262d" gap={16} />
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
