import type { PromptAttachment } from '@contracts/prompt-composer'

const SPATIAL_PIN_BLOCK = /\[Spatial pin on [\s\S]*\]\s*$/

export interface SpatialPinChatDisplay {
  prompt: string
}

/** Human-facing slice of a spatial-pin chat message. Agent text stays stored as-is. */
export function parseSpatialPinChatContent(content: string): SpatialPinChatDisplay | null {
  const match = content.match(SPATIAL_PIN_BLOCK)
  if (!match || match.index === undefined) return null
  return { prompt: content.slice(0, match.index).trim() }
}

export function isSpatialPinSnapshotAttachment(attachment: PromptAttachment): boolean {
  if (attachment.label === 'Spatial Pin snapshot') return true
  return attachment.ref.kind === 'file' && attachment.ref.path.includes('spatial-pins/')
}

export function spatialPinSnapshotPath(message: {
  content: string
  attachments?: PromptAttachment[]
}): string | null {
  if (!parseSpatialPinChatContent(message.content)) return null
  for (const attachment of message.attachments ?? []) {
    if (attachment.ref.kind === 'file' && isSpatialPinSnapshotAttachment(attachment)) {
      return attachment.ref.path
    }
  }
  const block = message.content.match(SPATIAL_PIN_BLOCK)?.[0] ?? ''
  const snapshot = block.match(/snapshot=([^·\]]+)/)
  const path = snapshot?.[1]?.trim()
  return path || null
}
