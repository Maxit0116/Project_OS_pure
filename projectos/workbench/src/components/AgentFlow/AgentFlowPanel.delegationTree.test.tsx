import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'

import type { AgentDelegationEvent, AgentRunEvent, AgentTransientTrace } from '@contracts/index'
import { useWorkbenchStore } from '../../state/workbenchStore'
import { DelegatedRunTree } from './AgentFlowPanel'

const timestamp = '2026-07-19T00:00:00.000Z'
const plan = {
  version: '0.1.0' as const,
  planId: 'plan_one',
  projectId: 'project_one',
  parentRunId: 'run_parent',
  nodeId: 'feat_login',
  contextBundleHash: `sha256:${'a'.repeat(64)}`,
  objective: 'Update the login experience',
  tasks: [{
    taskId: 'task_1',
    filePath: 'app/login/page.tsx',
    objective: 'Update the heading',
    acceptanceCriteria: ['The heading is updated'],
  }],
  rationale: 'The selected node owns the login page.',
}

const events: AgentDelegationEvent[] = [
  {
    eventId: 'event_plan',
    runId: 'run_parent',
    timestamp,
    type: 'plan_created',
    payload: { plan },
  },
  {
    eventId: 'event_task',
    runId: 'run_parent',
    timestamp,
    type: 'task_delegated',
    payload: {
      planId: plan.planId,
      taskId: 'task_1',
      childRunId: 'run_child',
      nodeId: plan.nodeId,
      filePath: 'app/login/page.tsx',
    },
  },
  {
    eventId: 'event_outcome',
    runId: 'run_parent',
    timestamp,
    type: 'child_run_outcome',
    payload: {
      planId: plan.planId,
      taskId: 'task_1',
      childRunId: 'run_child',
      status: 'applied',
      backupId: 'backup_one',
    },
  },
]

const childEvents: AgentRunEvent[] = [
  {
    eventId: 'child_step',
    runId: 'run_child',
    timestamp,
    type: 'step_completed',
    step: {
      id: 'run_child_locate_plan',
      label: 'Locate Plan',
      kind: 'locate_plan',
      status: 'complete',
      relatedNodeIds: ['feat_login'],
      relatedFiles: ['app/login/page.tsx'],
    },
  },
  {
    eventId: 'child_action',
    runId: 'run_child',
    timestamp,
    type: 'edit_plan_created',
    phaseId: 'run_child_locate_plan',
    payload: {
      path: 'app/login/page.tsx',
      objective: 'Update the heading',
      anchors: ['LoginPage heading'],
      acceptanceCriteria: ['The heading is updated'],
      rationale: 'The page owns the heading.',
    },
  },
]

const traces: AgentTransientTrace[] = [{
  traceId: 'trace_child',
  runId: 'run_child',
  timestamp,
  type: 'provider_reasoning',
  phaseId: 'run_child_locate_plan',
  content: 'Provider-supplied child trace',
  source: 'provider_supplied',
  truncated: false,
}]

afterEach(() => {
  useWorkbenchStore.setState({ locale: 'en' })
})

describe('AgentFlowPanel delegated run tree', () => {
  it('nests each real child phase, action, reasoning trace, and outcome under its plan task', () => {
    useWorkbenchStore.setState({ locale: 'en' })
    const html = renderToStaticMarkup(
      <DelegatedRunTree
        events={events}
        tracesByRun={{
          run_child: {
            taskId: 'task_1',
            filePath: 'app/login/page.tsx',
            events: childEvents,
            transientTraces: traces,
          },
        }}
      />,
    )

    expect(html).toContain('Update the login experience')
    expect(html).toContain('app/login/page.tsx')
    expect(html).toContain('Locate Plan')
    expect(html).toContain('data-action="edit_plan_created"')
    expect(html).toContain('Provider-supplied child trace')
    expect(html).toContain('data-child-outcome="applied"')
  })

  it('renders planner and leaf runs recursively at arbitrary hierarchy depths', () => {
    useWorkbenchStore.setState({ locale: 'en' })
    const hierarchyEvents: AgentDelegationEvent[] = [
      {
        eventId: 'global_plan',
        runId: 'run_global',
        timestamp,
        type: 'plan_created',
        payload: {
          plan: {
            version: '0.2.0',
            planId: 'plan_global',
            projectId: 'project_one',
            parentRunId: 'run_global',
            parentScope: { kind: 'global' },
            contextHash: `sha256:${'b'.repeat(64)}`,
            objective: 'Coordinate the product change',
            tasks: [{
              taskId: 'task_context',
              targetKind: 'planner',
              nodeId: 'context_product',
              level: 'context',
              objective: 'Plan the product context',
              acceptanceCriteria: ['Context plan is complete'],
            }],
            rationale: 'The global agent delegates into the graph.',
          },
        },
      },
      plannerDelegatedEvent('run_global', 'plan_global', 'task_context', 'run_context', 'context_product', 'context'),
    ]
    const contextEvents: AgentRunEvent[] = [
      completedStep('run_context', 'context_plan_step', 'Plan product context'),
      hierarchyPlanEvent('run_context', 'plan_context', { kind: 'context', nodeId: 'context_product' }, 'Plan the web system'),
      plannerDelegatedEvent('run_context', 'plan_context', 'task_container', 'run_container', 'container_web', 'container'),
    ]
    const containerEvents: AgentRunEvent[] = [
      hierarchyPlanEvent('run_container', 'plan_container', { kind: 'container', nodeId: 'container_web' }, 'Plan the login component'),
      plannerDelegatedEvent('run_container', 'plan_container', 'task_component', 'run_component', 'component_login', 'component'),
    ]
    const componentEvents: AgentRunEvent[] = [
      hierarchyPlanEvent('run_component', 'plan_component', { kind: 'component', nodeId: 'component_login' }, 'Edit the login page'),
      leafDelegatedEvent('run_component', 'plan_component', 'task_leaf', 'run_leaf', 'component_login', 'app/login/page.tsx'),
    ]

    const html = renderToStaticMarkup(
      <DelegatedRunTree
        events={hierarchyEvents}
        tracesByRun={{
          run_context: delegatedTrace('task_context', 'context_product', contextEvents, 'context', 'context_planner'),
          run_container: delegatedTrace('task_container', 'container_web', containerEvents, 'container', 'container_planner'),
          run_component: delegatedTrace('task_component', 'component_login', componentEvents, 'component', 'node_planner'),
          run_leaf: delegatedTrace('task_leaf', 'app/login/page.tsx', childEvents, 'leaf-file', 'leaf_file_editor', traces),
        }}
      />,
    )

    expect(html).toContain('data-run-role="global"')
    expect(html).toContain('data-run-role="context_planner"')
    expect(html).toContain('data-run-role="container_planner"')
    expect(html).toContain('data-run-role="node_planner"')
    expect(html).toContain('data-run-role="leaf_file_editor"')
    expect(html).toContain('data-tree-depth="4"')
    expect(html.indexOf('context_product')).toBeLessThan(html.indexOf('container_web'))
    expect(html.indexOf('container_web')).toBeLessThan(html.indexOf('component_login'))
    expect(html.indexOf('component_login')).toBeLessThan(html.indexOf('app/login/page.tsx'))
    expect(html).toContain('Provider-supplied child trace')
  })
})

function plannerDelegatedEvent(
  runId: string,
  planId: string,
  taskId: string,
  childRunId: string,
  nodeId: string,
  level: 'context' | 'container' | 'component',
): AgentDelegationEvent {
  return {
    eventId: `${runId}_${taskId}`,
    runId,
    timestamp,
    type: 'task_delegated',
    payload: { planId, taskId, childRunId, targetKind: 'planner', nodeId, level },
  }
}

function leafDelegatedEvent(
  runId: string,
  planId: string,
  taskId: string,
  childRunId: string,
  nodeId: string,
  filePath: string,
): AgentDelegationEvent {
  return {
    eventId: `${runId}_${taskId}`,
    runId,
    timestamp,
    type: 'task_delegated',
    payload: { planId, taskId, childRunId, targetKind: 'leaf-file', nodeId, filePath },
  }
}

function hierarchyPlanEvent(
  runId: string,
  planId: string,
  parentScope: { kind: 'context' | 'container' | 'component'; nodeId: string },
  objective: string,
): AgentDelegationEvent {
  const childLevel = parentScope.kind === 'context'
    ? 'container'
    : parentScope.kind === 'container'
      ? 'component'
      : undefined
  return {
    eventId: `${runId}_plan`,
    runId,
    timestamp,
    type: 'plan_created',
    payload: {
      plan: {
        version: '0.2.0',
        planId,
        projectId: 'project_one',
        parentRunId: runId,
        parentScope,
        contextHash: `sha256:${'c'.repeat(64)}`,
        objective,
        tasks: childLevel
          ? [{
              taskId: `${planId}_child`,
              targetKind: 'planner',
              nodeId: `${childLevel}_child`,
              level: childLevel,
              objective,
              acceptanceCriteria: ['Delegation completes'],
            }]
          : [{
              taskId: `${planId}_leaf`,
              targetKind: 'leaf-file',
              nodeId: parentScope.nodeId,
              filePath: 'app/login/page.tsx',
              objective,
              acceptanceCriteria: ['Edit completes'],
            }],
        rationale: 'Delegate one graph level.',
      },
    },
  }
}

function completedStep(runId: string, id: string, label: string): AgentRunEvent {
  return {
    eventId: `${id}_event`,
    runId,
    timestamp,
    type: 'step_completed',
    step: {
      id,
      label,
      kind: 'plan_delegation',
      status: 'complete',
      relatedNodeIds: [],
      relatedFiles: [],
    },
  }
}

function delegatedTrace(
  taskId: string,
  filePath: string,
  events: AgentRunEvent[],
  scopeKind: 'context' | 'container' | 'component' | 'leaf-file',
  role: 'context_planner' | 'container_planner' | 'node_planner' | 'leaf_file_editor',
  transientTraces: AgentTransientTrace[] = [],
) {
  return { taskId, filePath, scopeKind, role, events, transientTraces }
}
