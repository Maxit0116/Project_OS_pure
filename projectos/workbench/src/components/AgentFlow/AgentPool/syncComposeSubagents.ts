import type {
  PinComposerHub,
  PinComposerHubSubagentLink,
} from '@contracts/index'
import { useAgentPoolStore } from './agentPoolStore'
import type { ComposeSubagentLike } from './projectAgentPool'

/** Push Spatial Compose Hub subagent slots into the Agent Pool store. */
export function syncComposeSubagentsToPool(
  hubsByArrow: Record<string, PinComposerHub>,
  linksByArrow: Record<string, readonly PinComposerHubSubagentLink[]>,
): void {
  const slots: ComposeSubagentLike[] = []
  for (const [arrowId, hub] of Object.entries(hubsByArrow)) {
    const links = linksByArrow[arrowId] ?? []
    const linkMap = new Map(links.map((link) => [link.slotId, link]))
    for (const slot of hub.subagents ?? []) {
      if (!slot.enabled) continue
      const link = linkMap.get(slot.id)
      slots.push({
        slotId: `${arrowId}:${slot.id}`,
        name: slot.name,
        brief: slot.brief,
        link: link
          ? { ...link, slotId: `${arrowId}:${slot.id}` }
          : undefined,
      })
    }
  }
  useAgentPoolStore.getState().setComposeSubagents(slots)
}
