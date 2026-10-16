import type { ChatMessage, IntentEdgeKind, IntentGraph } from '@contracts/index'

export type LoopAuthoringTarget =
  | { type: 'node'; id: string; title: string }
  | { type: 'edge'; id: string; source: string; target: string; kind?: IntentEdgeKind }

export function findLoopAuthoringTarget(
  draft: IntentGraph | null | undefined,
  sessionId: string | null | undefined,
): LoopAuthoringTarget | null {
  if (!draft || !sessionId) return null
  const node = draft.nodes.find((item) => item.authoringSessionId === sessionId)
  if (node) return { type: 'node', id: node.id, title: node.title }
  const edge = draft.edges.find((item) => item.authoringSessionId === sessionId)
  if (edge) {
    return {
      type: 'edge',
      id: edge.id,
      source: edge.source,
      target: edge.target,
      kind: edge.kind,
    }
  }
  return null
}

export function buildLoopAuthoringPromptFromMessages(
  messages: ChatMessage[],
  maxLen: number,
  responsibility?: string | null,
): string {
  const parts: string[] = []
  const trimmedResponsibility = responsibility?.trim()
  if (trimmedResponsibility) parts.push(trimmedResponsibility)

  for (const message of messages) {
    if (message.role !== 'user' && message.role !== 'assistant') continue
    const text = message.content.trim()
    if (!text) continue
    parts.push(text)
  }

  const joined = parts.join('\n\n').trim()
  if (!joined) return ''
  if (joined.length <= maxLen) return joined
  return `${joined.slice(0, Math.max(0, maxLen - 1)).trimEnd()}…`
}

export function newLoopEntityId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}
