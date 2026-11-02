import type { ChatMessage, ChatSessionHead, ChatSessionRecord } from "./chat-session.js";
import { chatSessionHasChildren } from "./chat-session-context.js";
import type { ComposerDraft } from "./prompt-composer.js";
import { normalizeComposerDraft } from "./prompt-composer.js";

/**
 * Empty protected shells (fork child / pinned / manual graph claim) stay until
 * this validity window elapses, then are eligible for automatic cleanup.
 */
export const EMPTY_SESSION_VALID_MS = 24 * 60 * 60 * 1000;

export function chatSessionHasUserMessage(
  messages: ReadonlyArray<Pick<ChatMessage, "role" | "content">>,
): boolean {
  return messages.some(
    (message) => message.role === "user" && message.content.trim().length > 0,
  );
}

export function composerDraftHasContent(
  draft: ComposerDraft | string | null | undefined,
): boolean {
  const normalized = normalizeComposerDraft(
    typeof draft === "string" ? draft : draft ?? undefined,
  );
  return (
    normalized.text.trim().length > 0 ||
    normalized.attachments.length > 0 ||
    Boolean(normalized.invokedSkillId)
  );
}

/** Fork child, pinned, or manually placed on the session graph. */
export function isDeferredEmptySessionShell(
  head: Pick<
    ChatSessionHead,
    "id" | "parentSessionId" | "classification" | "classificationSource"
  >,
  pinnedIds: ReadonlyArray<string>,
): boolean {
  if (head.parentSessionId) return true;
  if (pinnedIds.includes(head.id)) return true;
  return (
    head.classification === "topic" && head.classificationSource === "manual"
  );
}

export function isEmptySessionPastValidTime(
  head: Pick<ChatSessionHead, "createdAt">,
  nowMs: number = Date.now(),
  validMs: number = EMPTY_SESSION_VALID_MS,
): boolean {
  const createdMs = Date.parse(head.createdAt);
  if (!Number.isFinite(createdMs)) return true;
  return nowMs - createdMs >= validMs;
}

export interface EmptySessionDisposalInput {
  head: ChatSessionHead;
  messages: ReadonlyArray<Pick<ChatMessage, "role" | "content">>;
  draft?: ComposerDraft | string | null;
  heads: ReadonlyArray<Pick<ChatSessionHead, "id" | "parentSessionId">>;
  pinnedIds: ReadonlyArray<string>;
  nowMs?: number;
  validMs?: number;
}

/**
 * Whether an empty session should be deleted now.
 * - Plain empty misc (no draft): delete immediately on leave / scan.
 * - Fork / pinned / manual-graph empty shells: only after EMPTY_SESSION_VALID_MS.
 */
export function shouldDisposeEmptySession(input: EmptySessionDisposalInput): boolean {
  const {
    head,
    messages,
    draft,
    heads,
    pinnedIds,
    nowMs = Date.now(),
    validMs = EMPTY_SESSION_VALID_MS,
  } = input;

  if (chatSessionHasUserMessage(messages)) return false;
  if (composerDraftHasContent(draft ?? null)) return false;
  if (head.status === "running") return false;
  if (chatSessionHasChildren(heads, head.id)) return false;

  if (isDeferredEmptySessionShell(head, pinnedIds)) {
    return isEmptySessionPastValidTime(head, nowMs, validMs);
  }

  return true;
}

export function shouldDisposeEmptySessionRecord(
  record: ChatSessionRecord,
  heads: ReadonlyArray<Pick<ChatSessionHead, "id" | "parentSessionId">>,
  pinnedIds: ReadonlyArray<string>,
  nowMs?: number,
  validMs?: number,
): boolean {
  return shouldDisposeEmptySession({
    head: record.head,
    messages: record.messages,
    draft: record.draftComposer ?? record.draftInput ?? null,
    heads,
    pinnedIds,
    nowMs,
    validMs,
  });
}

/** Prefer deleting children before parents so hasChildren checks succeed. */
export function orderSessionIdsForDeletion(
  ids: readonly string[],
  heads: ReadonlyArray<Pick<ChatSessionHead, "id" | "parentSessionId">>,
): string[] {
  const pending = new Set(ids);
  const ordered: string[] = [];

  while (pending.size > 0) {
    let progress = false;
    for (const id of [...pending]) {
      const hasChildInPending = heads.some(
        (head) => head.parentSessionId === id && pending.has(head.id),
      );
      if (hasChildInPending) continue;
      ordered.push(id);
      pending.delete(id);
      progress = true;
    }
    if (!progress) {
      ordered.push(...pending);
      break;
    }
  }

  return ordered;
}
