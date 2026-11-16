import type { LucideIcon } from 'lucide-react'
import {
  Brain,
  Cable,
  Cpu,
  Puzzle,
  Server,
  BookMarked,
  Package,
} from 'lucide-react'
import type {
  IntentEdgePort,
  IntentGraphEdge,
  IntentGraphNode,
  LoopAgentConfigPort,
  LoopAgentWiringStripPort,
  LoopSatelliteKind,
} from '@contracts/index'
import {
  configPortForSatelliteKind,
  effectiveConfigPort,
  estimateWorkGroupMemberChipSize,
  hasDutyAssignment,
  isConfigNode,
  LOOP_WORK_GROUP_MEMBER_CHIP_H,
  LOOP_WORK_GROUP_MEMBER_CHIP_MAX_W,
  LOOP_WORK_GROUP_MEMBER_CHIP_MIN_W,
} from '@contracts/index'
import { isDiamondLoopNode } from './loopNodeVisuals'
import {
  estimateDiamondBox,
  LOOP_DIAMOND_NODE_H,
  LOOP_DIAMOND_NODE_W,
} from './loopDiamondGeometry'
import {
  estimateWiringListCardSize,
  isWiringListKind,
  wiringListMembersOf,
} from '../../../../services/loop-wiring-list'

export { LOOP_DIAMOND_NODE_H, LOOP_DIAMOND_NODE_W }

/** Small rounded-square logo satellite under an Agent wiring port. */
export const LOOP_CONFIG_NODE_W = 36
export const LOOP_CONFIG_NODE_H = 36
/**
 * Max center-to-center distance between an Agent and its provides satellites
 * (model / MCP / skill). Farther satellites are pulled back along their offset.
 */
export const LOOP_SATELLITE_MAX_DISTANCE = 280
/** Minimum gap between agent bottom edge and satellite top edge. */
export const LOOP_SATELLITE_BELOW_GAP = 20

/**
 * Compact Agent duty body (pad + icon row + 2-line task + flex gaps).
 * Must fit real `.nodeAgentWired` content so N/E/S/W ports sit on the
 * outer border — if this is too short, min-content grows past the AABB and
 * the south port looks inset.
 */
export const LOOP_AGENT_DUTY_BODY_H = 74
/** Icon-button strip height (matches `.wiringStrip`; top margin lives in body). */
export const LOOP_AGENT_WIRING_STRIP_H = 36
/**
 * Horizontal padding on `.nodeAgentWired` (must match CSS).
 * Wiring strip full-bleeds by this amount so icon `left` and provides
 * attach X share the same node-local coordinate space.
 */
export const LOOP_AGENT_NODE_PAD_X = 10
/** Minimum Agent width. */
export const LOOP_AGENT_NODE_MIN_W = 280
/** Extra width per MCP / Skill capability beyond the first reserved slot. */
export const LOOP_AGENT_CAP_SLOT_W = 36
export const LOOP_DUTY_NODE_W = 200
export const LOOP_DUTY_NODE_H = 88

/**
 * Work-group member card: icon + title + duty checklist (no wiring strip).
 * Keep in sync with `.nodeWorkGroupMember` in LoopGraphOverlay.module.css.
 */
export const LOOP_WORK_GROUP_MEMBER_H = LOOP_WORK_GROUP_MEMBER_CHIP_H
export const LOOP_WORK_GROUP_MEMBER_MIN_W = LOOP_WORK_GROUP_MEMBER_CHIP_MIN_W
export const LOOP_WORK_GROUP_MEMBER_MAX_W = LOOP_WORK_GROUP_MEMBER_CHIP_MAX_W
/** Vertical pitch when placing a talent squad into a new work group. */
export const LOOP_WORK_GROUP_MEMBER_STACK_GAP = 12

/** True when an Agent is currently nested inside a work-group frame. */
export function isWorkGroupMemberAgent(node: IntentGraphNode): boolean {
  return (
    !isConfigNode(node) &&
    (node.type ?? 'agent') === 'agent' &&
    Boolean(node.workGroupId)
  )
}

/** AABB for a work-group member duty card (no wiring strip). */
export function workGroupMemberBoxSize(node: IntentGraphNode): {
  width: number
  height: number
} {
  const dutyItemCount = node.dutyItems?.length ?? 0
  const showIncomplete = !(
    hasDutyAssignment(node) ||
    dutyItemCount > 0 ||
    Boolean(node.prompt?.trim())
  )
  return estimateWorkGroupMemberChipSize({
    title: node.title || 'Agent',
    prompt: node.prompt,
    dutyItemCount,
    showIncomplete,
  })
}

/**
 * Horizontal share of the Agent card for each wiring group.
 * Model 1/5 · MCP 2/5 · Skills 2/5.
 */
export const AGENT_WIRING_ZONE_FRAC: Record<LoopAgentWiringStripPort, number> = {
  model: 1 / 5,
  mcp: 2 / 5,
  skill: 2 / 5,
}

export type WiringPortDef = {
  id: LoopAgentWiringStripPort
  label: string
  required?: boolean
  Icon: LucideIcon
}

export const AGENT_WIRING_PORTS: WiringPortDef[] = [
  { id: 'model', label: 'Model', required: true, Icon: Cpu },
  { id: 'mcp', label: 'MCP', Icon: Server },
  { id: 'skill', label: 'Skills', Icon: Puzzle },
]

/** One bottom-border config handle (hit target; visually hidden in UI). */
export type AgentWiringSlot = {
  key: string
  port: LoopAgentWiringStripPort
  /** Local X at the bottom border (center of the handle). */
  x: number
  /** Connected satellite when this slot is occupied. */
  satelliteId?: string
}

export type AgentWiringGroup = {
  port: LoopAgentWiringStripPort
  zoneStart: number
  zoneWidth: number
  /** Center X of the zone — icon button is centered here. */
  buttonX: number
  slotIndexes: number[]
}

export type AgentWiringLayout = {
  width: number
  height: number
  slots: AgentWiringSlot[]
  groups: AgentWiringGroup[]
}

const SATELLITE_ICONS: Record<LoopSatelliteKind, LucideIcon> = {
  model: Cpu,
  memory: Brain,
  skill: Puzzle,
  mcp: Server,
  mcp_list: Server,
  rules: BookMarked,
  pack: Package,
  skill_list: Puzzle,
}

const ZONE_ORDER: LoopAgentWiringStripPort[] = ['model', 'mcp', 'skill']

export function isConfigSatellite(node: IntentGraphNode): boolean {
  return isConfigNode(node)
}

export function satelliteIcon(kind: LoopSatelliteKind | undefined): LucideIcon {
  return kind ? SATELLITE_ICONS[kind] : Cable
}

const WORKFLOW_PORTS_ALL: IntentEdgePort[] = ['n', 'e', 's', 'w']

/** True when an Agent already has capability satellites hanging below. */
export function agentHasCapabilitySatellites(
  agentId: string,
  draft: { edges: IntentGraphEdge[] },
): boolean {
  return draft.edges.some(
    (edge) => edge.kind === 'provides' && edge.target === agentId,
  )
}

/**
 * Half-width of the clear vertical corridor under an Agent's south (S) port.
 * MCP satellites park outside this band so workflow edges aren't covered.
 */
export const LOOP_AGENT_SOUTH_CORRIDOR_HALF = 36

/**
 * Workflow N/E/S/W ports allowed on a node.
 * Agents always expose S (duty-body bottom center) for primary workflow links;
 * MCP satellites are parked beside the south corridor instead of blocking it.
 */
export function workflowPortsForNode(
  _node: IntentGraphNode,
  _draft?: { edges: IntentGraphEdge[] },
): readonly IntentEdgePort[] {
  return WORKFLOW_PORTS_ALL
}

/**
 * Default X (node-local, satellite top-left) for a capability satellite so the
 * Agent south corridor stays clear. MCP is forced left of center; model/skill
 * keep their icon-aligned X unless they already invade the corridor.
 */
export function parkSatelliteLocalX(input: {
  port: LoopAgentConfigPort | LoopAgentWiringStripPort
  preferredCenterX: number
  agentWidth: number
  stackIndex?: number
}): number {
  const half = LOOP_CONFIG_NODE_W / 2
  const center = input.agentWidth / 2
  const corridor = LOOP_AGENT_SOUTH_CORRIDOR_HALF
  const stack = Math.max(0, input.stackIndex ?? 0)
  const minCenter = half + 4
  const maxCenter = input.agentWidth - half - 4

  let centerX = input.preferredCenterX
  if (input.port === 'mcp') {
    // Stack additional MCPs further left of the corridor.
    centerX = center - corridor - half - 10 - stack * (LOOP_CONFIG_NODE_W + 8)
  } else if (
    centerX > center - corridor - half &&
    centerX < center + corridor + half
  ) {
    // Model / skill drifted into the corridor — push to the nearer side.
    centerX =
      centerX <= center
        ? center - corridor - half - 8
        : center + corridor + half + 8
  }

  centerX = Math.min(maxCenter, Math.max(minCenter, centerX))
  return centerX - half
}

/** Config satellites that `provides` into the given agent. */
export function listAgentProvidesSatellites(
  agentId: string,
  draft: { nodes: IntentGraphNode[]; edges: IntentGraphEdge[] },
): IntentGraphNode[] {
  const byId = new Map(draft.nodes.map((node) => [node.id, node]))
  const out: IntentGraphNode[] = []
  for (const edge of draft.edges) {
    if (edge.kind !== 'provides' || edge.target !== agentId) continue
    const sat = byId.get(edge.source)
    if (sat && isConfigNode(sat)) out.push(sat)
  }
  return out
}

function nodeCenter(
  position: { x: number; y: number },
  size: { width: number; height: number },
): { x: number; y: number } {
  return {
    x: position.x + size.width / 2,
    y: position.y + size.height / 2,
  }
}

/**
 * Keep a satellite **below** its agent and within `maxDistance`
 * (center-to-center). X is softly clipped near the agent width; Y never goes
 * above the agent bottom + gap.
 */
export function clampSatelliteToAgent(input: {
  agentPosition: { x: number; y: number }
  agentSize: { width: number; height: number }
  satellitePosition: { x: number; y: number }
  satelliteSize?: { width: number; height: number }
  maxDistance?: number
  belowGap?: number
}): { x: number; y: number } {
  const max = input.maxDistance ?? LOOP_SATELLITE_MAX_DISTANCE
  const gap = input.belowGap ?? LOOP_SATELLITE_BELOW_GAP
  const satSize = input.satelliteSize ?? {
    width: LOOP_CONFIG_NODE_W,
    height: LOOP_CONFIG_NODE_H,
  }
  const minY = input.agentPosition.y + input.agentSize.height + gap
  // Allow a little horizontal roam past the agent edges, but not far aside.
  const minX = input.agentPosition.x - satSize.width
  const maxX = input.agentPosition.x + input.agentSize.width
  let x = Math.min(maxX, Math.max(minX, input.satellitePosition.x))
  let y = Math.max(minY, input.satellitePosition.y)

  const agentCenter = nodeCenter(input.agentPosition, input.agentSize)
  let satCenter = nodeCenter({ x, y }, satSize)
  const dx = satCenter.x - agentCenter.x
  const dy = satCenter.y - agentCenter.y
  const dist = Math.hypot(dx, dy)
  if (dist > max && dist > 1e-6) {
    const scale = max / dist
    satCenter = {
      x: agentCenter.x + dx * scale,
      y: agentCenter.y + dy * scale,
    }
    x = satCenter.x - satSize.width / 2
    y = satCenter.y - satSize.height / 2
    // Distance pull must not defeat the "always below" rule.
    y = Math.max(minY, y)
    x = Math.min(maxX, Math.max(minX, x))
  }
  return { x, y }
}

/** Agent that a config satellite `provides` into, if any. */
export function findProvidesAgentForSatellite(
  satelliteId: string,
  draft: { nodes: IntentGraphNode[]; edges: IntentGraphEdge[] },
): IntentGraphNode | null {
  for (const edge of draft.edges) {
    if (edge.kind !== 'provides' || edge.source !== satelliteId) continue
    const agent = draft.nodes.find((node) => node.id === edge.target)
    if (agent && !isConfigNode(agent)) return agent
  }
  return null
}

/**
 * After an agent moves by a delta, translate its provides satellites by the
 * same delta and clamp each to `LOOP_SATELLITE_MAX_DISTANCE`.
 */
export function satelliteFollowAgentPatches(input: {
  agentId: string
  previousAgentPosition: { x: number; y: number }
  nextAgentPosition: { x: number; y: number }
  agentSize: { width: number; height: number }
  draft: { nodes: IntentGraphNode[]; edges: IntentGraphEdge[] }
  maxDistance?: number
}): Array<{ id: string; position: { x: number; y: number } }> {
  const dx = input.nextAgentPosition.x - input.previousAgentPosition.x
  const dy = input.nextAgentPosition.y - input.previousAgentPosition.y
  const satellites = listAgentProvidesSatellites(input.agentId, input.draft)
  if (satellites.length === 0) return []
  const patches: Array<{ id: string; position: { x: number; y: number } }> = []
  for (const sat of satellites) {
    const translated = {
      x: sat.position.x + dx,
      y: sat.position.y + dy,
    }
    const clamped = clampSatelliteToAgent({
      agentPosition: input.nextAgentPosition,
      agentSize: input.agentSize,
      satellitePosition: translated,
      ...(input.maxDistance !== undefined
        ? { maxDistance: input.maxDistance }
        : {}),
    })
    if (
      Math.abs(clamped.x - sat.position.x) < 0.5 &&
      Math.abs(clamped.y - sat.position.y) < 0.5
    ) {
      continue
    }
    patches.push({ id: sat.id, position: clamped })
  }
  return patches
}

/** World-space patches that move MCP (etc.) satellites out of the S corridor. */
export function clearAgentSouthCorridorPatches(
  agent: IntentGraphNode,
  draft: { nodes: IntentGraphNode[]; edges: IntentGraphEdge[] },
): Array<{ id: string; position: { x: number; y: number } }> {
  const layout = buildAgentWiringLayout(agent, draft)
  const agentWidth = layout.width
  const byId = new Map(draft.nodes.map((node) => [node.id, node]))
  const patches: Array<{ id: string; position: { x: number; y: number } }> = []

  let mcpStack = 0
  for (const edge of draft.edges) {
    if (edge.kind !== 'provides' || edge.target !== agent.id) continue
    const sat = byId.get(edge.source)
    if (!sat || !isConfigNode(sat)) continue
    const port = effectiveConfigPort(edge.configPort, sat.satelliteKind)
    if (
      port !== 'mcp' &&
      sat.satelliteKind !== 'mcp' &&
      sat.satelliteKind !== 'mcp_list'
    ) {
      continue
    }

    const preferred =
      layout.groups.find((group) => group.port === 'mcp')?.buttonX ??
      agentWidth * 0.4
    const localX = parkSatelliteLocalX({
      port: 'mcp',
      preferredCenterX: preferred,
      agentWidth,
      stackIndex: mcpStack,
    })
    mcpStack += 1
    const nextX = agent.position.x + localX
    // Keep current Y (user may have stacked vertically); only clear the corridor X.
    if (Math.abs(sat.position.x - nextX) < 1) continue
    patches.push({
      id: sat.id,
      position: { x: nextX, y: sat.position.y },
    })
  }
  return patches
}

export function countAgentCapabilities(
  agentId: string,
  draft: {
    nodes: IntentGraphNode[]
    edges: IntentGraphEdge[]
  },
): { model: number; mcp: number; skill: number } {
  let model = 0
  let mcp = 0
  let skill = 0
  const byId = new Map(draft.nodes.map((node) => [node.id, node]))
  for (const edge of draft.edges) {
    if (edge.kind !== 'provides' || edge.target !== agentId) continue
    const source = byId.get(edge.source)
    if (!source || !isConfigNode(source)) continue
    const port = effectiveConfigPort(edge.configPort, source.satelliteKind)
    if (port === 'model') model += 1
    else if (port === 'mcp') mcp += 1
    else if (port === 'skill') skill += 1
  }
  return { model, mcp, skill }
}

export function agentNodeWidth(mcpCount: number, skillCount: number): number {
  const mcpSlots = Math.max(1, mcpCount)
  const skillSlots = Math.max(1, skillCount)
  const extra = Math.max(0, mcpSlots - 1) + Math.max(0, skillSlots - 1)
  return LOOP_AGENT_NODE_MIN_W + extra * LOOP_AGENT_CAP_SLOT_W
}

function zoneGeometry(width: number): Record<
  LoopAgentWiringStripPort,
  { start: number; width: number; center: number }
> {
  let cursor = 0
  const result = {} as Record<
    LoopAgentWiringStripPort,
    { start: number; width: number; center: number }
  >
  for (const port of ZONE_ORDER) {
    const zoneWidth = width * AGENT_WIRING_ZONE_FRAC[port]
    result[port] = {
      start: cursor,
      width: zoneWidth,
      center: cursor + zoneWidth / 2,
    }
    cursor += zoneWidth
  }
  return result
}

/**
 * Build bottom-border slots + icon-button group centers for an Agent.
 *
 * Every provides edge / config handle for a port attaches at that port's
 * icon `buttonX` — never fanned across the zone. Multiple satellites of the
 * same port share one icon-aligned attach point on the agent bottom border.
 */
export function buildAgentWiringLayout(
  agent: IntentGraphNode,
  draft: { nodes: IntentGraphNode[]; edges: IntentGraphEdge[] },
): AgentWiringLayout {
  const byId = new Map(draft.nodes.map((node) => [node.id, node]))
  const modelSats: IntentGraphNode[] = []
  const mcpSats: IntentGraphNode[] = []
  const skillSats: IntentGraphNode[] = []

  for (const edge of draft.edges) {
    if (edge.kind !== 'provides' || edge.target !== agent.id) continue
    const source = byId.get(edge.source)
    if (!source || !isConfigNode(source)) continue
    const port = effectiveConfigPort(edge.configPort, source.satelliteKind)
    if (port === 'model') modelSats.push(source)
    else if (port === 'mcp') mcpSats.push(source)
    else if (port === 'skill') skillSats.push(source)
  }

  const width = agentNodeWidth(mcpSats.length, skillSats.length)
  const height = LOOP_AGENT_DUTY_BODY_H + LOOP_AGENT_WIRING_STRIP_H
  const zones = zoneGeometry(width)

  const slots: AgentWiringSlot[] = []
  const groups: AgentWiringGroup[] = []

  const pushGroup = (
    port: LoopAgentWiringStripPort,
    sats: IntentGraphNode[],
  ) => {
    const zone = zones[port]
    const openOrSats: Array<IntentGraphNode | null> =
      sats.length === 0 ? [null] : sats
    // Icon-aligned attach X shared by every satellite of this port.
    const attachX = zone.center
    const slotIndexes: number[] = []
    openOrSats.forEach((sat) => {
      slotIndexes.push(slots.length)
      slots.push({
        key: sat ? `${port}:${sat.id}` : `${port}:open`,
        port,
        x: attachX,
        ...(sat ? { satelliteId: sat.id } : {}),
      })
    })
    groups.push({
      port,
      zoneStart: zone.start,
      zoneWidth: zone.width,
      buttonX: zone.center,
      slotIndexes,
    })
  }

  pushGroup('model', modelSats.slice(0, 1))
  pushGroup('mcp', mcpSats)
  pushGroup('skill', skillSats)

  return { width, height, slots, groups }
}

export function slotLocalPoint(
  layout: AgentWiringLayout,
  slotIndex: number,
): { x: number; y: number } {
  const slot = layout.slots[slotIndex]
  return {
    x: slot?.x ?? layout.width / 2,
    y: layout.height,
  }
}

export function nodeBoxSize(
  node: IntentGraphNode,
  draft?: { nodes: IntentGraphNode[]; edges: IntentGraphEdge[] },
  options?: {
    /** Measured diamond AABB from autosize (overrides estimate). */
    diamondBoxes?: Record<string, { width: number; height: number }>
    /**
     * L1 dashed-frame chips use compact size. L2 interior graph must use the
     * same full Agent/duty cards as the top-level Loops Graph — pass false.
     * Default true preserves L1 frame / matrix math.
     */
    compactWorkGroupMembers?: boolean
  },
): { width: number; height: number } {
  if (isConfigNode(node)) {
    if (isWiringListKind(node.satelliteKind)) {
      return estimateWiringListCardSize(wiringListMembersOf(node).length)
    }
    return { width: LOOP_CONFIG_NODE_W, height: LOOP_CONFIG_NODE_H }
  }
  if (isDiamondLoopNode(node)) {
    const measured = options?.diamondBoxes?.[node.id]
    if (measured) return measured
    return estimateDiamondBox({
      title: node.title,
      prompt: node.prompt,
    })
  }
  const isAgent = (node.type ?? 'agent') === 'agent'
  if (isAgent) {
    const compactMembers = options?.compactWorkGroupMembers !== false
    if (compactMembers && isWorkGroupMemberAgent(node)) {
      return workGroupMemberBoxSize(node)
    }
    if (draft) {
      const layout = buildAgentWiringLayout(node, draft)
      return { width: layout.width, height: layout.height }
    }
    return {
      width: LOOP_AGENT_NODE_MIN_W,
      height: LOOP_AGENT_DUTY_BODY_H + LOOP_AGENT_WIRING_STRIP_H,
    }
  }
  return {
    width: LOOP_DUTY_NODE_W,
    height: LOOP_DUTY_NODE_H,
  }
}

/**
 * Workflow N/E/S/W attachment box.
 * Agents use the full card AABB so S sits on the bottom border center
 * (between the Model / MCP / Skills wiring attach points).
 */
export function workflowPortBoxSize(
  node: IntentGraphNode,
  draft?: { nodes: IntentGraphNode[]; edges: IntentGraphEdge[] },
  options?: {
    diamondBoxes?: Record<string, { width: number; height: number }>
    compactWorkGroupMembers?: boolean
  },
): {
  width: number
  height: number
} {
  return nodeBoxSize(node, draft, options)
}

/**
 * Local offset of a strip config port (relative to node top-left / padding edge).
 * Always the icon-button center on the bottom border — every satellite of this
 * port shares that single attach point (`satelliteId` is kept for callers).
 */
export function wiringPortOffset(
  port: LoopAgentConfigPort,
  width = LOOP_AGENT_NODE_MIN_W,
  layout?: AgentWiringLayout,
  _satelliteId?: string,
): { x: number; y: number } {
  if (layout) {
    const key = (port === 'mcp' || port === 'skill' || port === 'model'
      ? port
      : 'model') as LoopAgentWiringStripPort
    const group = layout.groups.find((item) => item.port === key)
    if (group) {
      return {
        x: group.buttonX,
        y: layout.height,
      }
    }
  }
  const zones = zoneGeometry(width)
  const key = (port === 'mcp' || port === 'skill' || port === 'model'
    ? port
    : 'model') as LoopAgentWiringStripPort
  return {
    x: zones[key].center,
    y: LOOP_AGENT_DUTY_BODY_H + LOOP_AGENT_WIRING_STRIP_H,
  }
}

export function expectedConfigPort(
  satellite: IntentGraphNode,
): LoopAgentConfigPort | null {
  if (!isConfigNode(satellite) || !satellite.satelliteKind) return null
  return configPortForSatelliteKind(satellite.satelliteKind)
}

export function resolveProvidesPort(
  edgePort: LoopAgentConfigPort | undefined,
  satellite: IntentGraphNode,
): LoopAgentConfigPort | undefined {
  return effectiveConfigPort(edgePort, satellite.satelliteKind)
}

/** World-space point for a provides edge into an Agent strip port. */
export function agentWiringPortPoint(
  agent: IntentGraphNode,
  port: LoopAgentConfigPort,
  options?: {
    draft?: { nodes: IntentGraphNode[]; edges: IntentGraphEdge[] }
    satelliteId?: string
  },
): { x: number; y: number } {
  const layout = options?.draft
    ? buildAgentWiringLayout(agent, options.draft)
    : undefined
  const width = layout?.width ?? nodeBoxSize(agent, options?.draft).width
  const local = wiringPortOffset(port, width, layout, options?.satelliteId)
  return {
    x: agent.position.x + local.x,
    y: agent.position.y + local.y,
  }
}
