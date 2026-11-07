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
  Merge,
  MessageSquareWarning,
  Puzzle,
  Repeat,
  SearchCheck,
  Server,
  ShieldCheck,
  Terminal,
  TextCursorInput,
} from 'lucide-react'
import {
  withArchitectureDefaults,
  type IntentGraphNode,
  type LoopPaletteCategory,
  type LoopPaletteItem,
} from '@contracts/index'

export const LOOP_PALETTE_MIME = 'application/x-projectos-loop-palette'

export type LoopVisualKey =
  | 'agent.planner'
  | 'agent.coder'
  | 'agent.reviewer'
  | 'action.test'
  | 'action.github.create_pr'
  | 'action.github.create_branch'
  | 'action.terminal'
  | 'logic.condition'
  | 'logic.loop'
  | 'logic.merge'
  | 'logic.exit'
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
}

const VISUALS: Record<LoopVisualKey, LoopNodeVisual> = {
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
  },
  'action.github.create_branch': {
    key: 'action.github.create_branch',
    category: 'action',
    Icon: GitBranch,
    shortLabel: 'Branch',
    categoryClass: 'catAction',
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
  if (node.humanMode === 'approval') return 'human.approval'
  if (node.humanMode === 'review') return 'human.review'
  if (node.humanMode === 'input') return 'human.input'
  if (node.type === 'agent') return 'agent.coder'
  if (node.type === 'action') return 'action.test'
  if (node.type === 'logic') return 'logic.condition'
  if (node.type === 'human') return 'human.approval'
  return 'draft'
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
