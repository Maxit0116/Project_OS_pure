import {
  type ChatMessage,
  type ChatSessionHead,
  type ChatSessionRecord,
  type SessionContextDigest,
} from "./chat-session.js";
import {
  chatSessionHasChildren,
  isSubstantiveChat,
  resolveChatSessionClassification,
} from "./chat-session-context.js";
import {
  isUnusedForkChildSessionRecord,
  orderSessionIdsForDeletion,
} from "./chat-session-empty.js";

export const SESSION_SWEEP_REASON = [
  "misc",
  "trivial",
  "short_oneshot",
  "explore_oneshot",
  "no_decisions",
  "quiet",
] as const;

export type SessionSweepReason = (typeof SESSION_SWEEP_REASON)[number];

export type SessionSweepActionKind = "delete" | "reorganize";

export interface SessionSweepCandidate {
  sessionId: string;
  title: string;
  reasons: SessionSweepReason[];
  action: SessionSweepActionKind;
  /** Direct children that stay (block plain delete). */
  retainedChildIds: string[];
  /** Sessions removed if this candidate is confirmed (self + deletable low-value descendants). */
  deleteIds: string[];
}

export interface SessionSweepPlan {
  generatedAt: string;
  candidates: SessionSweepCandidate[];
}

export interface SessionSweepSnoozeMap {
  [sessionId: string]: string; // ISO expiry
}

const QUIET_MS = 3 * 24 * 60 * 60 * 1000;
const SHORT_USER_TURNS = 2;

const EXPLORE_HINT =
  /怎么|为什么|什么意思|解释一下|在哪|如何理解|怎么工作|how does|what is|explain|where is|\?$/iu;

function firstLine(content: string): string {
  const line = content
    .trim()
    .split(/\r?\n/u)
    .map((part) => part.trim())
    .find((part) => part.length > 0);
  return line ?? "";
}

function clampSummary(text: string, max = 120): string {
  const compact = text.replace(/\s+/gu, " ").trim();
  if (compact.length <= max) return compact;
  return `${compact.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function userTurns(messages: readonly ChatMessage[]): ChatMessage[] {
  return messages.filter(
    (message) => message.role === "user" && message.content.trim().length > 0,
  );
}

function hasDecisionSignal(
  head: ChatSessionHead,
  digest: SessionContextDigest | undefined,
): boolean {
  if ((digest?.decisions?.length ?? 0) > 0) return true;
  return (head.previewStrip ?? []).some((item) => item.kind === "decision");
}

function hasOutcomeSignal(head: ChatSessionHead): boolean {
  return (head.previewStrip ?? []).some(
    (item) => item.kind === "outcome" || item.kind === "decision",
  );
}

export function isSessionSweepHardExcluded(
  head: ChatSessionHead,
  pinnedIds: ReadonlyArray<string>,
  options: {
    activeSessionId?: string | null;
    snoozedUntil?: SessionSweepSnoozeMap;
    nowMs?: number;
  } = {},
): boolean {
  const nowMs = options.nowMs ?? Date.now();
  if (head.isArchived) return true;
  if (head.status === "running" || head.status === "awaiting_review") return true;
  if (pinnedIds.includes(head.id)) return true;
  if (options.activeSessionId && head.id === options.activeSessionId) return true;
  const snooze = options.snoozedUntil?.[head.id];
  if (snooze && Date.parse(snooze) > nowMs) return true;
  return false;
}

/**
 * Heuristic: low-value / one-shot sessions that are safe to nominate for daily cleanup.
 * All low-value sessions are in scope (not limited to "opened today").
 */
/**
 * Manual Session Graph remove (archive / delete control):
 * - low-value or unused fork child → hard delete
 * - otherwise → demote to Misc (caller handles placeSessionOnGraph)
 *
 * Running / awaiting sessions stay on the graph (return false) so the agent
 * work is not discarded from the remove control.
 */
export function shouldHardDeleteInsteadOfMisc(
  record: ChatSessionRecord,
  options: { nowMs?: number } = {},
): boolean {
  if (record.head.status === "running" || record.head.status === "awaiting_review") {
    return false;
  }
  if (isUnusedForkChildSessionRecord(record)) return true;
  return classifyLowValueSession(record, options).length > 0;
}

export function classifyLowValueSession(
  record: ChatSessionRecord,
  options: { nowMs?: number } = {},
): SessionSweepReason[] {
  const nowMs = options.nowMs ?? Date.now();
  const { head, messages, contextDigest } = record;
  const reasons: SessionSweepReason[] = [];
  const users = userTurns(messages);
  const classification = resolveChatSessionClassification(head);
  const substantive = isSubstantiveChat(messages);
  const quiet =
    head.status === "idle" &&
    Date.parse(head.lastUpdatedAt) > 0 &&
    nowMs - Date.parse(head.lastUpdatedAt) >= QUIET_MS;

  if (classification === "misc") reasons.push("misc");
  if (!substantive) reasons.push("trivial");

  if (users.length > 0 && users.length <= SHORT_USER_TURNS && !hasDecisionSignal(head, contextDigest)) {
    reasons.push("short_oneshot");
  }

  if (
    users.length === 1 &&
    !hasOutcomeSignal(head) &&
    EXPLORE_HINT.test(users[0]?.content ?? "")
  ) {
    reasons.push("explore_oneshot");
  }

  if (
    classification === "topic" &&
    substantive &&
    users.length <= SHORT_USER_TURNS &&
    !hasDecisionSignal(head, contextDigest) &&
    !(head.responsibility?.trim())
  ) {
    reasons.push("no_decisions");
  }

  if (quiet && (classification === "misc" || !hasDecisionSignal(head, contextDigest))) {
    reasons.push("quiet");
  }

  // Need at least one strong signal; "quiet" alone on a rich topic is not enough.
  if (reasons.length === 1 && reasons[0] === "quiet" && hasDecisionSignal(head, contextDigest)) {
    return [];
  }
  if (reasons.length === 0) return [];
  if (hasDecisionSignal(head, contextDigest) && users.length > SHORT_USER_TURNS) {
    return [];
  }
  return [...new Set(reasons)];
}

export function collectDirectChildIds(
  heads: ReadonlyArray<Pick<ChatSessionHead, "id" | "parentSessionId">>,
  parentId: string,
): string[] {
  return heads.filter((head) => head.parentSessionId === parentId).map((head) => head.id);
}

export function collectDescendantIds(
  heads: ReadonlyArray<Pick<ChatSessionHead, "id" | "parentSessionId">>,
  rootId: string,
): string[] {
  const childrenByParent = new Map<string, string[]>();
  for (const head of heads) {
    if (!head.parentSessionId) continue;
    const list = childrenByParent.get(head.parentSessionId) ?? [];
    list.push(head.id);
    childrenByParent.set(head.parentSessionId, list);
  }
  const out: string[] = [];
  const stack = [...(childrenByParent.get(rootId) ?? [])];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    for (const child of childrenByParent.get(id) ?? []) stack.push(child);
  }
  return out;
}

/**
 * Build the daily sweep candidate list for every low-value session, synced with the graph tree.
 * Parents with retained (non-low-value) children are marked `reorganize` instead of plain delete.
 */
export function buildSessionSweepPlan(
  records: readonly ChatSessionRecord[],
  pinnedIds: ReadonlyArray<string>,
  options: {
    activeSessionId?: string | null;
    snoozedUntil?: SessionSweepSnoozeMap;
    /** Protected while continuity tidy is pending / preferred. */
    excludeSessionIds?: ReadonlyArray<string>;
    nowMs?: number;
    generatedAt?: string;
  } = {},
): SessionSweepPlan {
  const nowMs = options.nowMs ?? Date.now();
  const generatedAt = options.generatedAt ?? new Date(nowMs).toISOString();
  const heads = records.map((record) => record.head);
  const byId = new Map(records.map((record) => [record.head.id, record]));
  const excluded = new Set(options.excludeSessionIds ?? []);

  const lowValue = new Map<string, SessionSweepReason[]>();
  for (const record of records) {
    if (excluded.has(record.head.id)) continue;
    if (
      isSessionSweepHardExcluded(record.head, pinnedIds, {
        activeSessionId: options.activeSessionId,
        snoozedUntil: options.snoozedUntil,
        nowMs,
      })
    ) {
      continue;
    }
    const reasons = classifyLowValueSession(record, { nowMs });
    if (reasons.length > 0) lowValue.set(record.head.id, reasons);
  }

  const candidates: SessionSweepCandidate[] = [];
  for (const [sessionId, reasons] of lowValue) {
    const record = byId.get(sessionId);
    if (!record) continue;
    const descendants = collectDescendantIds(heads, sessionId);
    const retainedChildIds = collectDirectChildIds(heads, sessionId).filter(
      (childId) => !lowValue.has(childId),
    );
    const deletableDescendants = descendants.filter((id) => lowValue.has(id));
    const action: SessionSweepActionKind =
      retainedChildIds.length > 0 ? "reorganize" : "delete";
    candidates.push({
      sessionId,
      title: record.head.title.trim() || sessionId,
      reasons,
      action,
      retainedChildIds,
      deleteIds:
        action === "delete"
          ? [sessionId, ...deletableDescendants]
          : [sessionId, ...deletableDescendants.filter((id) => {
              // When reorganizing, still delete low-value descendants that are not ancestors of retained children.
              const retainedSet = new Set(retainedChildIds);
              const underRetained = collectDescendantIds(heads, id).some((d) =>
                retainedSet.has(d),
              ) || retainedSet.has(id);
              return !underRetained;
            })],
    });
  }

  candidates.sort((a, b) => a.title.localeCompare(b.title));
  return { generatedAt, candidates };
}

/** Resolve checked candidate ids into ordered delete ids + reparent operations. */
export function resolveSessionSweepExecution(
  plan: SessionSweepPlan,
  checkedSessionIds: ReadonlyArray<string>,
  heads: ReadonlyArray<ChatSessionHead>,
): {
  deleteIds: string[];
  reparent: Array<{ childId: string; newParentId: string | null; fromParentId: string }>;
} {
  const checked = new Set(checkedSessionIds);
  const deleteSet = new Set<string>();
  const reparent: Array<{ childId: string; newParentId: string | null; fromParentId: string }> =
    [];
  const headById = new Map(heads.map((head) => [head.id, head]));

  for (const candidate of plan.candidates) {
    if (!checked.has(candidate.sessionId)) continue;

    if (candidate.action === "delete") {
      for (const id of candidate.deleteIds) deleteSet.add(id);
      continue;
    }

    // Reorganize: promote retained children to grandparent, then delete this low-value node
    // (and any low-value side branches listed in deleteIds).
    const parent = headById.get(candidate.sessionId);
    const grandparentId = parent?.parentSessionId ?? null;
    for (const childId of candidate.retainedChildIds) {
      reparent.push({
        childId,
        newParentId: grandparentId,
        fromParentId: candidate.sessionId,
      });
    }
    for (const id of candidate.deleteIds) deleteSet.add(id);
  }

  // Never delete a node that still has a non-deleted child after reparent planning.
  for (const head of heads) {
    if (!head.parentSessionId) continue;
    if (!deleteSet.has(head.parentSessionId)) continue;
    const willReparent = reparent.some((edge) => edge.childId === head.id);
    if (!deleteSet.has(head.id) && !willReparent) {
      // Child survives without reparent entry — keep parent too.
      deleteSet.delete(head.parentSessionId);
    }
  }

  const deleteIds = orderSessionIdsForDeletion([...deleteSet], heads);
  return { deleteIds, reparent };
}

/** Pair each user prompt with assistant reply data for the history sheet. */
export function buildSessionPromptHistory(
  messages: readonly ChatMessage[],
): Array<{
  user: ChatMessage;
  assistantSummary: string | null;
  /** Full assistant reply body for expand-in-place (may be long). */
  assistantContent: string | null;
  assistantMessageId: string | null;
}> {
  const rows: Array<{
    user: ChatMessage;
    assistantSummary: string | null;
    assistantContent: string | null;
    assistantMessageId: string | null;
  }> = [];

  for (let i = 0; i < messages.length; i += 1) {
    const message = messages[i];
    if (!message || message.role !== "user" || !message.content.trim()) continue;
    let assistantSummary: string | null = null;
    let assistantContent: string | null = null;
    let assistantMessageId: string | null = null;
    for (let j = i + 1; j < messages.length; j += 1) {
      const next = messages[j];
      if (!next) break;
      if (next.role === "user") break;
      if (next.role === "assistant" && next.content.trim()) {
        assistantContent = next.content.trim();
        assistantSummary = clampSummary(firstLine(assistantContent));
        assistantMessageId = next.id;
        break;
      }
    }
    rows.push({
      user: message,
      assistantSummary,
      assistantContent,
      assistantMessageId,
    });
  }
  return rows;
}

/** Drop trivial user turns (and their immediate assistant replies) from a kept session. */
export function stripLowValueTurns(record: ChatSessionRecord): ChatSessionRecord {
  const drop = new Set<string>();
  for (let i = 0; i < record.messages.length; i += 1) {
    const message = record.messages[i];
    if (!message || message.role !== "user") continue;
    const compact = message.content.replace(/\s+/gu, " ").trim();
    const trivial =
      /^(?:hi|hello|hey|yo|ok|okay|thanks|thank you|thx|test|testing|ping|你好|您好|嗨|哈喽|在吗|测试|谢谢|早上好|晚安|早|嗯|啊|哦)[!！.。,，?？~\s]*$/iu.test(
        compact,
      );
    if (!trivial) continue;
    drop.add(message.id);
    const next = record.messages[i + 1];
    if (next?.role === "assistant") drop.add(next.id);
  }
  if (drop.size === 0) return record;
  return {
    ...record,
    messages: record.messages.filter((message) => !drop.has(message.id)),
  };
}

export function applyReparentToHead(
  head: ChatSessionHead,
  newParentId: string | null,
  now = new Date().toISOString(),
): ChatSessionHead {
  const next: ChatSessionHead = {
    ...head,
    lastUpdatedAt: now,
  };
  if (newParentId) {
    next.parentSessionId = newParentId;
  } else {
    delete next.parentSessionId;
  }
  delete next.forkMessageId;
  return next;
}

export function sessionHasBlockingChildren(
  heads: ReadonlyArray<Pick<ChatSessionHead, "id" | "parentSessionId">>,
  sessionId: string,
  deleteIds: ReadonlySet<string>,
): boolean {
  if (!chatSessionHasChildren(heads, sessionId)) return false;
  return heads.some(
    (head) => head.parentSessionId === sessionId && !deleteIds.has(head.id),
  );
}
