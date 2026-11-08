import type { ChatMessage, SessionGraphStripItem } from '@contracts/index'

export interface SessionNodeStripPromptPreview {
  /** Full user prompt text when resolvable; otherwise the strip title. */
  body: string
  /** Assistant reply that followed the user prompt, when present. */
  reply: string | null
  /** User message id to fork from, when a concrete turn exists. */
  forkMessageId: string | null
  /** True when body came from a real user message (not just the strip title). */
  fromUserMessage: boolean
  /** Chat mode of the linked user turn (Conversation Nav stack-bar color). */
  chatMode?: string
}

function firstLine(content: string): string {
  const line = content
    .trim()
    .split(/\r?\n/u)
    .map((part) => part.trim())
    .find((part) => part.length > 0)
  return line ?? ''
}

function findPrecedingUser(
  messages: readonly ChatMessage[],
  fromIndex: number,
): ChatMessage | null {
  for (let i = fromIndex; i >= 0; i -= 1) {
    const previous = messages[i]
    if (!previous || previous.role !== 'user') continue
    if (!previous.content.trim()) continue
    return previous
  }
  return null
}

function findFollowingAssistant(
  messages: readonly ChatMessage[],
  userIndex: number,
): ChatMessage | null {
  for (let i = userIndex + 1; i < messages.length; i += 1) {
    const next = messages[i]
    if (!next) continue
    if (next.role === 'user') return null
    if (next.role === 'assistant' && next.content.trim()) return next
  }
  return null
}

/** Match a strip title against a user turn when messageId is missing or stale. */
function findUserByStripTitle(
  item: SessionGraphStripItem,
  messages: readonly ChatMessage[],
): ChatMessage | null {
  const title = item.title.trim()
  if (!title) return null
  const users = messages.filter(
    (message) => message.role === 'user' && message.content.trim().length > 0,
  )
  const exact = users.find((message) => firstLine(message.content) === title)
  if (exact) return exact
  const starts = users.find((message) => {
    const line = firstLine(message.content)
    return line.startsWith(title) || title.startsWith(line) || message.content.trim().startsWith(title)
  })
  return starts ?? null
}

/**
 * Resolve the user prompt that a Session Graph strip row should preview / branch from.
 * Prefer the linked message; if it is an assistant/system turn, walk backward to the
 * nearest non-empty user message. Fall back to title matching when needed.
 */
function withChatMode(
  preview: SessionNodeStripPromptPreview,
  message: ChatMessage | null | undefined,
  item: SessionGraphStripItem,
): SessionNodeStripPromptPreview {
  const chatMode = message?.chatMode ?? item.chatMode
  return chatMode ? { ...preview, chatMode } : preview
}

function previewForUser(
  user: ChatMessage,
  messages: readonly ChatMessage[],
  item: SessionGraphStripItem,
): SessionNodeStripPromptPreview {
  const userIndex = messages.findIndex((message) => message.id === user.id)
  const assistant =
    userIndex >= 0 ? findFollowingAssistant(messages, userIndex) : null
  return withChatMode(
    {
      body: user.content.trim(),
      reply: assistant?.content.trim() || null,
      forkMessageId: user.id,
      fromUserMessage: true,
    },
    user,
    item,
  )
}

export function resolveSessionNodeStripPromptPreview(
  item: SessionGraphStripItem,
  messages: readonly ChatMessage[],
): SessionNodeStripPromptPreview {
  const fallback: SessionNodeStripPromptPreview = withChatMode(
    {
      body: item.title,
      reply: null,
      forkMessageId: null,
      fromUserMessage: false,
    },
    null,
    item,
  )

  if (messages.length === 0) return fallback

  if (item.messageId) {
    const index = messages.findIndex((message) => message.id === item.messageId)
    if (index >= 0) {
      const linked = messages[index]
      if (linked?.role === 'user' && linked.content.trim()) {
        return previewForUser(linked, messages, item)
      }
      const preceding = findPrecedingUser(messages, index - 1)
      if (preceding) {
        return previewForUser(preceding, messages, item)
      }
      const linkedContent = linked?.content.trim() ?? ''
      if (linkedContent) {
        return withChatMode(
          {
            body: item.title || linkedContent,
            reply: linked?.role === 'assistant' ? linkedContent : null,
            forkMessageId: null,
            fromUserMessage: false,
          },
          null,
          item,
        )
      }
    }
  }

  const byTitle = findUserByStripTitle(item, messages)
  if (byTitle) {
    return previewForUser(byTitle, messages, item)
  }

  return fallback
}

/** Message id ChatPanel should scroll to for a strip row (prefer the user prompt). */
export function resolveStripRevealMessageId(
  item: SessionGraphStripItem,
  messages: readonly ChatMessage[],
): string | null {
  const resolved = resolveSessionNodeStripPromptPreview(item, messages)
  return resolved.forkMessageId ?? item.messageId ?? null
}

/** Mode used to tint the strip marker like a Conversation Nav stack bar. */
export function resolveStripChatMode(
  item: SessionGraphStripItem,
  messages: readonly ChatMessage[],
): string | undefined {
  if (item.chatMode) return item.chatMode
  return resolveSessionNodeStripPromptPreview(item, messages).chatMode
}
