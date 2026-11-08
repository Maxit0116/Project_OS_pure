import { describe, expect, it } from 'vitest'
import type { ChatMessage, SessionGraphStripItem } from '@contracts/index'
import {
  resolveSessionNodeStripPromptPreview,
  resolveStripChatMode,
  resolveStripRevealMessageId,
} from './sessionNodeStripPreview'

function msg(
  partial: Pick<ChatMessage, 'id' | 'role' | 'content'> &
    Partial<Pick<ChatMessage, 'timestamp' | 'chatMode'>>,
): ChatMessage {
  return {
    timestamp: partial.timestamp ?? '2026-01-01T00:00:00.000Z',
    ...partial,
  }
}

function item(
  partial: Partial<SessionGraphStripItem> & Pick<SessionGraphStripItem, 'id' | 'title'>,
): SessionGraphStripItem {
  return {
    kind: 'intent',
    ts: '2026-01-01T00:00:00.000Z',
    ...partial,
  }
}

describe('resolveSessionNodeStripPromptPreview', () => {
  it('returns the full user prompt when the strip points at a user message', () => {
    const messages = [
      msg({
        id: 'u1',
        role: 'user',
        content: 'Please implement contextual strip previews\nwith branching.',
      }),
    ]
    const result = resolveSessionNodeStripPromptPreview(
      item({ id: 'intent:u1', title: 'Please implement contextual…', messageId: 'u1' }),
      messages,
    )
    expect(result.body).toContain('with branching.')
    expect(result.reply).toBeNull()
    expect(result.forkMessageId).toBe('u1')
    expect(result.fromUserMessage).toBe(true)
  })

  it('walks back to the nearest user message for assistant outcomes', () => {
    const messages = [
      msg({ id: 'u1', role: 'user', content: 'Fix the hover preview.' }),
      msg({ id: 'a1', role: 'assistant', content: 'Done — preview now switches.' }),
    ]
    const result = resolveSessionNodeStripPromptPreview(
      item({
        id: 'outcome:a1',
        kind: 'outcome',
        title: 'Done — preview now switches.',
        messageId: 'a1',
      }),
      messages,
    )
    expect(result.body).toBe('Fix the hover preview.')
    expect(result.reply).toBe('Done — preview now switches.')
    expect(result.forkMessageId).toBe('u1')
    expect(result.fromUserMessage).toBe(true)
  })

  it('falls back to the strip title when no message is linked', () => {
    const result = resolveSessionNodeStripPromptPreview(
      item({ id: 'note:1', kind: 'note', title: 'Owns session graph hover UX' }),
      [],
    )
    expect(result).toEqual({
      body: 'Owns session graph hover UX',
      reply: null,
      forkMessageId: null,
      fromUserMessage: false,
    })
  })

  it('includes the following assistant reply for a user turn', () => {
    const messages = [
      msg({ id: 'u1', role: 'user', content: 'Summarize the hover UX.' }),
      msg({ id: 'a1', role: 'assistant', content: 'Prompt-only title; reply expands below.' }),
    ]
    const result = resolveSessionNodeStripPromptPreview(
      item({ id: 'intent:u1', title: 'Summarize the hover UX.', messageId: 'u1' }),
      messages,
    )
    expect(result.body).toBe('Summarize the hover UX.')
    expect(result.reply).toBe('Prompt-only title; reply expands below.')
  })

  it('matches a user turn by strip title when messageId is missing', () => {
    const messages = [
      msg({ id: 'u1', role: 'user', content: 'Fix the hover preview.\nMore detail.' }),
      msg({ id: 'a1', role: 'assistant', content: 'Done.' }),
    ]
    const result = resolveSessionNodeStripPromptPreview(
      item({ id: 'intent:orphan', title: 'Fix the hover preview.' }),
      messages,
    )
    expect(result.forkMessageId).toBe('u1')
    expect(result.fromUserMessage).toBe(true)
  })

  it('resolveStripRevealMessageId prefers the user prompt id', () => {
    const messages = [
      msg({ id: 'u1', role: 'user', content: 'Pin this turn at the top.' }),
      msg({ id: 'a1', role: 'assistant', content: 'Pinned.' }),
    ]
    expect(
      resolveStripRevealMessageId(
        item({
          id: 'outcome:a1',
          kind: 'outcome',
          title: 'Pinned.',
          messageId: 'a1',
        }),
        messages,
      ),
    ).toBe('u1')
  })

  it('surfaces chatMode from the linked user turn for stack-bar coloring', () => {
    const messages = [
      msg({
        id: 'u1',
        role: 'user',
        content: 'Plan the strip jump.',
        chatMode: 'plan',
      }),
      msg({ id: 'a1', role: 'assistant', content: 'Outlined.' }),
    ]
    const resolved = resolveSessionNodeStripPromptPreview(
      item({
        id: 'outcome:a1',
        kind: 'outcome',
        title: 'Outlined.',
        messageId: 'a1',
      }),
      messages,
    )
    expect(resolved.forkMessageId).toBe('u1')
    expect(resolved.chatMode).toBe('plan')
    expect(resolveStripChatMode(item({ id: 'x', title: 'Plan the strip jump.' }), messages)).toBe(
      'plan',
    )
  })
})
