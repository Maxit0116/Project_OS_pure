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
  IntentGraphNode,
  LoopAgentConfigPort,
  LoopSatelliteKind,
} from '@contracts/index'
import { configPortForSatelliteKind, isConfigNode } from '@contracts/index'

export const LOOP_CONFIG_NODE_W = 132
export const LOOP_CONFIG_NODE_H = 40
export const LOOP_AGENT_WIRING_STRIP_H = 22

export type WiringPortDef = {
  id: LoopAgentConfigPort
  label: string
  required?: boolean
}

export const AGENT_WIRING_PORTS: WiringPortDef[] = [
  { id: 'model', label: 'Model*', required: true },
  { id: 'memory', label: 'Memory' },
  { id: 'capability', label: 'Capability' },
]

const SATELLITE_ICONS: Record<LoopSatelliteKind, LucideIcon> = {
  model: Cpu,
  memory: Brain,
  skill: Puzzle,
  mcp: Server,
  rules: BookMarked,
  pack: Package,
}

export function isConfigSatellite(node: IntentGraphNode): boolean {
  return isConfigNode(node)
}

export function satelliteIcon(kind: LoopSatelliteKind | undefined): LucideIcon {
  return kind ? SATELLITE_ICONS[kind] : Cable
}

export function nodeBoxSize(node: IntentGraphNode): { width: number; height: number } {
  if (isConfigNode(node)) {
    return { width: LOOP_CONFIG_NODE_W, height: LOOP_CONFIG_NODE_H }
  }
  const isAgent = (node.type ?? 'agent') === 'agent'
  return {
    width: 200,
    height: isAgent ? 48 + LOOP_AGENT_WIRING_STRIP_H : 56,
  }
}

export function wiringPortOffset(
  port: LoopAgentConfigPort,
  width = 200,
): { x: number; y: number } {
  const index = AGENT_WIRING_PORTS.findIndex((item) => item.id === port)
  const slot = index < 0 ? 1 : index
  const gap = width / (AGENT_WIRING_PORTS.length + 1)
  return {
    x: gap * (slot + 1),
    y: 48 + LOOP_AGENT_WIRING_STRIP_H - 2,
  }
}

export function expectedConfigPort(
  satellite: IntentGraphNode,
): LoopAgentConfigPort | null {
  if (!isConfigNode(satellite) || !satellite.satelliteKind) return null
  return configPortForSatelliteKind(satellite.satelliteKind)
}
