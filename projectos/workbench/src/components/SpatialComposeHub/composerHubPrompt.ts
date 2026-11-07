import {
  emptyPinComposerHub,
  formatPinComposerHubLines,
  normalizeHubScopes,
  type PinComposerHub,
} from '@contracts/spatial-pin'

function normalizeHub(value: PinComposerHub): PinComposerHub {
  const defaults = emptyPinComposerHub()
  return normalizeHubScopes({
    ...defaults,
    ...value,
    folders: value.folders ?? defaults.folders,
    scopes: value.scopes ?? defaults.scopes,
    skillIds: value.skillIds ?? defaults.skillIds,
    mcpServerIds: value.mcpServerIds ?? defaults.mcpServerIds,
    references: value.references ?? defaults.references,
    referenceFolders: value.referenceFolders ?? defaults.referenceFolders,
    subagents: value.subagents ?? defaults.subagents,
  })
}

/** Append hub context lines to an agent prompt (mirrors spatial-pin submission). */
export function appendComposerHubToPrompt(
  prompt: string,
  hub: PinComposerHub | undefined | null,
): string {
  const trimmed = prompt.trim()
  if (!hub) return trimmed
  const lines = formatPinComposerHubLines(normalizeHub(hub))
  if (lines.length === 0) return trimmed
  return `${trimmed}\n\n${lines.join('\n')}`
}

export type ComposerStageSlot =
  | 'repo'
  | 'scope'
  | 'mcp'
  | 'skills'
  | 'references'
  | 'research'

export const COMPOSER_STAGE_SLOTS: readonly ComposerStageSlot[] = [
  'repo',
  'scope',
  'mcp',
  'skills',
  'references',
  'research',
] as const

export function stageSlotBadgeCount(
  slot: ComposerStageSlot,
  hub: PinComposerHub,
): number {
  const normalized = normalizeHub(hub)
  switch (slot) {
    case 'repo':
      return normalized.repo?.label ? 1 : 0
    case 'scope':
      return normalized.scopes.length || normalized.folders.length
    case 'mcp':
      return normalized.mcpServerIds.length
    case 'skills':
      return normalized.skillIds.length
    case 'references':
      return normalized.references.length
    case 'research':
      return normalized.researchEnabled ? 1 : 0
  }
}
