import type { ComposerDraft, PromptAttachment, PromptContextRef } from '@contracts/index'
import { emptyComposerDraft } from '@contracts/index'

export type ComposerTriggerKind = '@' | '/' | null

export interface ActiveComposerTrigger {
  kind: NonNullable<ComposerTriggerKind>
  query: string
  start: number
  end: number
}

export function createAttachmentId(): string {
  return `att_${crypto.randomUUID()}`
}

export function detectComposerTrigger(
  text: string,
  cursor: number,
): ActiveComposerTrigger | null {
  const before = text.slice(0, cursor)
  const atMatch = /(?:^|\s)@([^\s@]*)$/u.exec(before)
  if (atMatch && atMatch.index !== undefined) {
    const token = atMatch[0]
    const start = before.length - token.length + (token.startsWith(' ') ? 1 : 0)
    return {
      kind: '@',
      query: atMatch[1] ?? '',
      start,
      end: cursor,
    }
  }
  const slashMatch = /(?:^|\s)\/([^\s/]*)$/u.exec(before)
  if (slashMatch && slashMatch.index !== undefined) {
    const token = slashMatch[0]
    const start = before.length - token.length + (token.startsWith(' ') ? 1 : 0)
    return {
      kind: '/',
      query: slashMatch[1] ?? '',
      start,
      end: cursor,
    }
  }
  return null
}

export function removeTriggerToken(text: string, trigger: ActiveComposerTrigger): string {
  return `${text.slice(0, trigger.start)}${text.slice(trigger.end)}`
}

export function appendAttachment(
  draft: ComposerDraft,
  attachment: PromptAttachment,
): ComposerDraft {
  const exists = draft.attachments.some(
    (item) => JSON.stringify(item.ref) === JSON.stringify(attachment.ref),
  )
  if (exists) return draft
  return {
    ...draft,
    attachments: [...draft.attachments, attachment],
  }
}

export function removeAttachment(draft: ComposerDraft, attachmentId: string): ComposerDraft {
  return {
    ...draft,
    attachments: draft.attachments.filter((item) => item.id !== attachmentId),
    ...(draft.invokedSkillId && draft.attachments.every((item) => item.id !== attachmentId)
      ? {}
      : {}),
  }
}

export function setComposerText(draft: ComposerDraft, text: string): ComposerDraft {
  return { ...draft, text }
}

export function clearComposerAfterSend(): ComposerDraft {
  return emptyComposerDraft()
}

export function draftHasContent(draft: ComposerDraft): boolean {
  return Boolean(draft.text.trim() || draft.attachments.length > 0 || draft.invokedSkillId)
}

export function refKey(ref: PromptContextRef): string {
  return JSON.stringify(ref)
}
