import type { LucideIcon } from 'lucide-react'
import {
  Box,
  Brain,
  CircleCheck,
  ClipboardList,
  Code2,
  Cpu,
  FlaskConical,
  GitBranch,
  GitFork,
  GitPullRequest,
  Hourglass,
  Merge,
  MessageSquare,
  MessageSquareWarning,
  Puzzle,
  RefreshCw,
  Repeat,
  SearchCheck,
  Server,
  ShieldCheck,
  Terminal,
  TextCursorInput,
  Users,
} from 'lucide-react'
import {
  withArchitectureDefaults,
  type IntentGraphNode,
  type LoopPaletteCategory,
  type LoopPaletteItem,
} from '@contracts/index'
import {
  getLoopIntegration,
  integrationIdFromActionNode,
  type LoopIntegrationRuntimeStatus,
} from './integrations/loopIntegrationRegistry'

export const LOOP_PALETTE_MIME = 'application/x-projectos-loop-palette'

export type LoopVisualKey =
  | 'workgroup.create'
  | 'agent.planner'
  | 'agent.coder'
  | 'agent.reviewer'
  | 'action.test'
  | 'action.github.create_pr'
  | 'action.github.create_branch'
  | 'action.slack.post_message'
  | 'action.feishu.post_message'
  | 'action.lark.post_message'
  | 'action.sentry.list_issues'
  | 'action.terminal'
  | 'logic.condition'
  | 'logic.loop'
  | 'logic.merge'
  | 'logic.exit'
  | 'logic.retry'
  | 'logic.wait'
  | 'human.approval'
  | 'human.review'
  | 'human.input'
  | 'config.model'
  | 'config.memory.project'
  | 'config.memory.buffer'
  | 'config.skill'
  | 'config.mcp'
  | 'draft'

export type LoopNodeVisual = {
  key: LoopVisualKey
  category: LoopPaletteCategory | 'draft'
  Icon: LucideIcon
  shortLabel: string
  categoryClass: string
  /** Local SaaS brand icon key when present (GitHub/Slack/Lark). */
  integrationIconKey?: string
  integrationId?: string
  operationLabel?: string
  defaultRuntimeStatus?: LoopIntegrationRuntimeStatus
}

const VISUALS: Record<LoopVisualKey, LoopNodeVisual> = {
  'workgroup.create': {
    key: 'workgroup.create',
    category: 'workgroup',
    Icon: Users,
    shortLabel: 'Work Group',
    categoryClass: 'catWorkgroup',
  },
  'agent.planner': {
    key: 'agent.planner',
    category: 'agent',
    Icon: ClipboardList,
    shortLabel: 'Planner',
    categoryClass: 'catAgent',
  },
  'agent.coder': {
    key: 'agent.coder',
    category: 'agent',
    Icon: Code2,
    shortLabel: 'Coder',
    categoryClass: 'catAgent',
  },
  'agent.reviewer': {
    key: 'agent.reviewer',
    category: 'agent',
    Icon: SearchCheck,
    shortLabel: 'Reviewer',
    categoryClass: 'catAgent',
  },
  'action.test': {
    key: 'action.test',
    category: 'action',
    Icon: FlaskConical,
    shortLabel: 'Test',
    categoryClass: 'catAction',
  },
  'action.github.create_pr': {
    key: 'action.github.create_pr',
    category: 'action',
    Icon: GitPullRequest,
    shortLabel: 'Create PR',
    categoryClass: 'catAction',
    integrationId: 'github',
    integrationIconKey: 'github',
    operationLabel: 'Create PR',
    defaultRuntimeStatus: 'auth_missing',
  },
  'action.github.create_branch': {
    key: 'action.github.create_branch',
    category: 'action',
    Icon: GitBranch,
    shortLabel: 'Branch',
    categoryClass: 'catAction',
    integrationId: 'github',
    integrationIconKey: 'github',
    operationLabel: 'Create branch',
    defaultRuntimeStatus: 'auth_missing',
  },
  'action.slack.post_message': {
    key: 'action.slack.post_message',
    category: 'action',
    Icon: MessageSquare,
    shortLabel: 'Slack',
    categoryClass: 'catAction',
    integrationId: 'slack',
    integrationIconKey: 'slack',
    operationLabel: 'Post message',
    defaultRuntimeStatus: 'unconfigured',
  },
  'action.feishu.post_message': {
    key: 'action.feishu.post_message',
    category: 'action',
    Icon: MessageSquare,
    shortLabel: '飞书',
    categoryClass: 'catAction',
    integrationId: 'feishu',
    integrationIconKey: 'feishu',
    operationLabel: 'Send message',
    defaultRuntimeStatus: 'unconfigured',
  },
  'action.lark.post_message': {
    key: 'action.lark.post_message',
    category: 'action',
    Icon: MessageSquare,
    shortLabel: 'Lark',
    categoryClass: 'catAction',
    integrationId: 'lark',
    integrationIconKey: 'lark',
    operationLabel: 'Send message',
    defaultRuntimeStatus: 'unconfigured',
  },
  'action.sentry.list_issues': {
    key: 'action.sentry.list_issues',
    category: 'action',
    Icon: FlaskConical,
    shortLabel: 'Sentry',
    categoryClass: 'catAction',
    integrationId: 'sentry',
    integrationIconKey: 'sentry',
    operationLabel: 'List issues',
    defaultRuntimeStatus: 'unconfigured',
  },
  'action.terminal': {
    key: 'action.terminal',
    category: 'action',
    Icon: Terminal,
    shortLabel: 'Terminal',
    categoryClass: 'catAction',
  },
  'logic.condition': {
    key: 'logic.condition',
    category: 'logic',
    Icon: GitFork,
    shortLabel: 'Condition',
    categoryClass: 'catLogic',
  },
  'logic.loop': {
    key: 'logic.loop',
    category: 'logic',
    Icon: Repeat,
    shortLabel: 'Loop',
    categoryClass: 'catLogic',
  },
  'logic.merge': {
    key: 'logic.merge',
    category: 'logic',
    Icon: Merge,
    shortLabel: 'Merge',
    categoryClass: 'catLogic',
  },
  'logic.exit': {
    key: 'logic.exit',
    category: 'logic',
    Icon: CircleCheck,
    shortLabel: 'Exit',
    categoryClass: 'catLogic',
  },
  'logic.retry': {
    key: 'logic.retry',
    category: 'logic',
    Icon: RefreshCw,
    shortLabel: 'Retry',
    categoryClass: 'catLogic',
  },
  'logic.wait': {
    key: 'logic.wait',
    category: 'logic',
    Icon: Hourglass,
    shortLabel: 'Wait',
    categoryClass: 'catLogic',
  },
  'human.approval': {
    key: 'human.approval',
    category: 'human',
    Icon: ShieldCheck,
    shortLabel: 'Approval',
    categoryClass: 'catHuman',
  },
  'human.review': {
    key: 'human.review',
    category: 'human',
    Icon: MessageSquareWarning,
    shortLabel: 'Review',
    categoryClass: 'catHuman',
  },
  'human.input': {
    key: 'human.input',
    category: 'human',
    Icon: TextCursorInput,
    shortLabel: 'Input',
    categoryClass: 'catHuman',
  },
  'config.model': {
    key: 'config.model',
    category: 'config',
    Icon: Cpu,
    shortLabel: 'Model',
    categoryClass: 'catConfig',
  },
  'config.memory.project': {
    key: 'config.memory.project',
    category: 'config',
    Icon: Brain,
    shortLabel: 'Memory',
    categoryClass: 'catConfig',
  },
  'config.memory.buffer': {
    key: 'config.memory.buffer',
    category: 'config',
    Icon: Brain,
    shortLabel: 'Buffer',
    categoryClass: 'catConfig',
  },
  'config.skill': {
    key: 'config.skill',
    category: 'config',
    Icon: Puzzle,
    shortLabel: 'Skill',
    categoryClass: 'catConfig',
  },
  'config.mcp': {
    key: 'config.mcp',
    category: 'config',
    Icon: Server,
    shortLabel: 'MCP',
    categoryClass: 'catConfig',
  },
  draft: {
    key: 'draft',
    category: 'draft',
    Icon: Box,
    shortLabel: 'Draft',
    categoryClass: 'catDraft',
  },
}

export function visualForPaletteItem(item: Pick<LoopPaletteItem, 'id'>): LoopNodeVisual {
  const key = item.id as LoopVisualKey
  return VISUALS[key] ?? VISUALS.draft
}

export function visualKeyFromArchitecture(node: {
  type?: string
  agentRole?: string
  humanMode?: string
  actionIntegration?: string
  actionOperation?: string
  logicKind?: string
  satelliteKind?: string
  configRef?: { memoryMode?: string }
  prompt?: string
}): LoopVisualKey {
  if (node.type === 'config') {
    if (node.satelliteKind === 'model') return 'config.model'
    if (node.satelliteKind === 'memory') {
      return node.configRef?.memoryMode === 'buffer'
        ? 'config.memory.buffer'
        : 'config.memory.project'
    }
    if (node.satelliteKind === 'mcp') return 'config.mcp'
    if (node.satelliteKind === 'skill') return 'config.skill'
    return 'config.model'
  }
  const integration = node.actionIntegration
  const operation = node.actionOperation
  if (integration === 'test') return 'action.test'
  if (integration === 'terminal') return 'action.terminal'
  if (integration === 'slack') return 'action.slack.post_message'
  if (integration === 'feishu') return 'action.feishu.post_message'
  if (integration === 'lark') return 'action.lark.post_message'
  if (integration === 'sentry') return 'action.sentry.list_issues'
  if (integration === 'github') {
    if (operation === 'create_branch') return 'action.github.create_branch'
    if (operation === 'create_pr' || !operation) return 'action.github.create_pr'
  }
  if (node.agentRole === 'planner') return 'agent.planner'
  if (node.agentRole === 'coder') return 'agent.coder'
  if (node.agentRole === 'reviewer') return 'agent.reviewer'
  if (node.logicKind === 'condition') return 'logic.condition'
  if (node.logicKind === 'loop') return 'logic.loop'
  if (node.logicKind === 'merge') return 'logic.merge'
  if (node.logicKind === 'exit') return 'logic.exit'
  if (node.logicKind === 'retry') return 'logic.retry'
  if (node.logicKind === 'wait') return 'logic.wait'
  if (node.humanMode === 'approval') return 'human.approval'
  if (node.humanMode === 'review') return 'human.review'
  if (node.humanMode === 'input') return 'human.input'
  if (node.type === 'agent') return 'agent.coder'
  if (node.type === 'action') return 'action.test'
  if (node.type === 'logic') return 'logic.condition'
  if (node.type === 'human') return 'human.approval'
  return 'draft'
}

export function visualForKey(key: LoopVisualKey): LoopNodeVisual {
  return VISUALS[key] ?? VISUALS.draft
}

/** Condition + human approval render as flat diamonds (corners = N/E/S/W ports). */
export const DIAMOND_LOOP_VISUAL_KEYS = [
  'logic.condition',
  'human.approval',
] as const satisfies readonly LoopVisualKey[]

export type DiamondLoopVisualKey = (typeof DIAMOND_LOOP_VISUAL_KEYS)[number]

export function isDiamondLoopVisualKey(key: LoopVisualKey): key is DiamondLoopVisualKey {
  return (DIAMOND_LOOP_VISUAL_KEYS as readonly string[]).includes(key)
}

export function isDiamondLoopNode(node: IntentGraphNode): boolean {
  return isDiamondLoopVisualKey(visualForIntentNode(node).key)
}

export function visualForIntentNode(node: IntentGraphNode): LoopNodeVisual {
  if (node.type === 'config') {
    return VISUALS[visualKeyFromArchitecture(node)]
  }
  const arch = withArchitectureDefaults(node)
  const incomplete = !node.prompt?.trim() && !node.type
  if (incomplete && !node.agentRole && !node.actionIntegration && !node.logicKind && !node.humanMode) {
    // Untitled blank authoring node
    if (!node.type) return VISUALS.draft
  }
  const key = visualKeyFromArchitecture(arch)
  return VISUALS[key]
}

/** Resolve SaaS brand visual extras for an intent/architecture node. */
export function saasVisualForNode(node: {
  actionIntegration?: string | null
  actionOperation?: string | null
}): Pick<
  LoopNodeVisual,
  'integrationIconKey' | 'integrationId' | 'operationLabel' | 'defaultRuntimeStatus'
> | null {
  const id = integrationIdFromActionNode({
    actionIntegration: node.actionIntegration,
    actionOperation: node.actionOperation,
  })
  if (!id || id === 'http' || id === 'webhook') return null
  const meta = getLoopIntegration(id)
  if (!meta || meta.iconKey === 'fallback') return null
  const op =
    meta.actions.find((action) => action.id === node.actionOperation)?.label ??
    meta.actions.find((action) => action.kind === 'action')?.label ??
    meta.displayName
  return {
    integrationId: id,
    integrationIconKey: meta.iconKey,
    operationLabel: op,
    defaultRuntimeStatus: meta.defaultRuntimeStatus,
  }
}

export function encodePaletteDragPayload(paletteItemId: string): string {
  return JSON.stringify({ paletteItemId })
}

export function decodePaletteDragPayload(raw: string): string | null {
  try {
    const parsed = JSON.parse(raw) as { paletteItemId?: unknown }
    return typeof parsed.paletteItemId === 'string' && parsed.paletteItemId.trim()
      ? parsed.paletteItemId
      : null
  } catch {
    return null
  }
}
