import { useMemo } from 'react'
import {
  ReactFlow,
  Background,
  Position,
  ReactFlowProvider,
  type Node,
  type Edge,
} from '@xyflow/react'
import type { AgentFlowStep } from '@contracts/index'
import { useI18n } from '../../i18n'
import { agentFlowStepLabel } from './stepLabel'
import styles from './AgentFlowGraph.module.css'

interface Props {
  steps: AgentFlowStep[]
  status: string
  onSelectStep: (id: string) => void
}

const H_SPACING = 220

function FlowInner({ steps, onSelectStep }: Props) {
  const { messages } = useI18n()
  const flowNodes: Node[] = useMemo(
    () =>
      steps.map((step, i) => ({
        id: step.id,
        position: { x: i * H_SPACING, y: 40 },
        // Steps run left to right, so the arrows leave on the right and arrive on the left.
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        data: { label: agentFlowStepLabel(step, messages.agentFlow.stepKind), status: step.status },
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
    [steps, messages],
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
