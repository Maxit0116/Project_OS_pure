import type { AskSubMode } from '@contracts/index'
import type { PinComposer, SpatialPinMode } from '@contracts/spatial-pin'

/** Region / pin fields that travel with the compose mode switch. */
export interface ComposerModeFields {
  mode: SpatialPinMode
  askSubMode?: AskSubMode
  agentDefinitionId?: string | null
  agentDisplayName?: string | null
}

/** Normalize mode-related fields before writing a pin composer payload. */
export function pinComposerModeFields(
  fields: ComposerModeFields,
): Pick<
  PinComposer,
  'mode' | 'askSubMode' | 'agentDefinitionId' | 'agentDisplayName'
> {
  const mode = fields.mode
  if (mode === 'ask') {
    return {
      mode,
      askSubMode: fields.askSubMode ?? 'chat',
      agentDefinitionId: null,
      agentDisplayName: null,
    }
  }
  if (mode === 'change') {
    const agentDefinitionId = fields.agentDefinitionId?.trim() || null
    return {
      mode,
      askSubMode: undefined,
      agentDefinitionId,
      agentDisplayName: agentDefinitionId
        ? (fields.agentDisplayName ?? null)
        : null,
    }
  }
  return {
    mode,
    askSubMode: undefined,
    agentDefinitionId: null,
    agentDisplayName: null,
  }
}
