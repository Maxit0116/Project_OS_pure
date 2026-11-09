import type { ChatMessage, ChatSessionRecord } from "./chat-session.js";
import {
  MATCH_FLOOR,
  mapAffinityConfidence,
  scorePromptAgainstSessionCore,
} from "./session-affinity.js";

export const SESSION_ROUTE_REASONS = [
  "same_responsibility",
  "shared_refs",
  "similar_intent",
  "title_overlap",
  "continuation_cue",
  "branch_cue",
  "active_session",
] as const;

export type SessionRouteReason = (typeof SESSION_ROUTE_REASONS)[number];

export type SessionRouteAction = "stay" | "switch" | "branch";

export type SessionRouteConfidence = "high" | "medium" | "low";

export interface SessionRouteCandidate {
  sessionId: string;
  title: string;
  score: number;
  reasons: SessionRouteReason[];
  /** Preferred fork point when action is branch. */
  forkMessageId?: string;
}

export interface SessionRouteSuggestion {
  action: SessionRouteAction;
  targetSessionId: string;
  title: string;
  score: number;
  confidence: SessionRouteConfidence;
  reasons: SessionRouteReason[];
  forkMessageId?: string;
  alternatives: SessionRouteCandidate[];
  /** High confidence → apply without preview. */
  autoApply: boolean;
}

const BRANCH_CUE =
  /另(?:一种|做一版|一版|起)|并行|不要改原来|别动主线|对比方案|alternative(?:\s+approach)?|in parallel|don'?t (?:change|touch) (?:the )?main|fork (?:off|from)|branch off/iu;

/** Prefer digest.throughMessageId, else latest user message. */
export function resolveForkMessageId(record: ChatSessionRecord): string | undefined {
  const through = record.contextDigest?.throughMessageId?.trim();
  if (through && record.messages.some((message) => message.id === through)) {
    return through;
  }
  const latestUser = [...record.messages]
    .reverse()
    .find((message) => message.role === "user" && message.content.trim());
  return latestUser?.id;
}

function scorePromptAgainstSession(
  prompt: string,
  record: ChatSessionRecord,
  activeSessionId: string | null,
): SessionRouteCandidate {
  const scored = scorePromptAgainstSessionCore(prompt, record, { activeSessionId });
  const forkMessageId = resolveForkMessageId(record);
  return {
    sessionId: record.head.id,
    title: record.head.title.trim() || record.head.id,
    score: scored.score,
    reasons: scored.reasons as SessionRouteReason[],
    ...(forkMessageId ? { forkMessageId } : {}),
  };
}

function confidenceFor(
  best: SessionRouteCandidate,
  secondScore: number,
): SessionRouteConfidence {
  return mapAffinityConfidence(best.score, secondScore, best.reasons);
}

function pickAction(
  prompt: string,
  best: SessionRouteCandidate,
  activeSessionId: string | null,
  recordById: Map<string, ChatSessionRecord>,
  confidence: SessionRouteConfidence,
): SessionRouteAction {
  if (confidence === "low" || best.score < MATCH_FLOOR) return "stay";

  const wantsBranch = BRANCH_CUE.test(prompt);
  if (wantsBranch && best.sessionId) {
    return "branch";
  }

  if (activeSessionId && best.sessionId === activeSessionId) return "stay";

  const target = recordById.get(best.sessionId);
  if (
    target &&
    (target.head.status === "running" || target.head.status === "awaiting_review")
  ) {
    return confidence === "high" || confidence === "medium" ? "branch" : "stay";
  }

  return "switch";
}

/**
 * Rank sessions for a composer prompt and decide stay / switch / branch.
 * Match failure → stay. High confidence → autoApply true (caller skips preview).
 */
export function buildSessionRouteSuggestion(
  prompt: string,
  records: readonly ChatSessionRecord[],
  options: {
    activeSessionId?: string | null;
    autoApplyHighConfidence?: boolean;
  } = {},
): SessionRouteSuggestion {
  const trimmed = prompt.trim();
  const activeSessionId = options.activeSessionId ?? null;
  const autoApplyHighConfidence = options.autoApplyHighConfidence !== false;

  const activeRecord =
    (activeSessionId && records.find((record) => record.head.id === activeSessionId)) ||
    records[0];
  const fallbackId = activeRecord?.head.id ?? activeSessionId ?? "unknown";
  const fallbackTitle = activeRecord?.head.title?.trim() || fallbackId;

  if (!trimmed) {
    return {
      action: "stay",
      targetSessionId: fallbackId,
      title: fallbackTitle,
      score: 0,
      confidence: "low",
      reasons: ["active_session"],
      alternatives: [],
      autoApply: false,
    };
  }

  const recordById = new Map(records.map((record) => [record.head.id, record]));

  const candidates = records
    .filter((record) => !record.head.isArchived)
    .map((record) => scorePromptAgainstSession(trimmed, record, activeSessionId))
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));

  const best = candidates[0];
  if (!best || best.score < MATCH_FLOOR) {
    return {
      action: "stay",
      targetSessionId: fallbackId,
      title: fallbackTitle,
      score: best?.score ?? 0,
      confidence: "low",
      reasons: best?.reasons?.length ? best.reasons : ["active_session"],
      alternatives: candidates.slice(0, 3),
      autoApply: false,
    };
  }

  const secondScore = candidates[1]?.score ?? 0;
  const confidence = confidenceFor(best, secondScore);
  let action = pickAction(trimmed, best, activeSessionId, recordById, confidence);

  if (action === "branch" && !best.forkMessageId) {
    const target = recordById.get(best.sessionId);
    if (!target || target.messages.length === 0) {
      action = activeSessionId === best.sessionId ? "stay" : "switch";
    }
  }

  const autoApply = autoApplyHighConfidence && confidence === "high";

  return {
    action,
    targetSessionId: best.sessionId,
    title: best.title,
    score: best.score,
    confidence,
    reasons: best.reasons,
    ...(best.forkMessageId ? { forkMessageId: best.forkMessageId } : {}),
    alternatives: candidates.slice(0, 3),
    autoApply,
  };
}

/** Test helper: expose message id resolution. */
export function latestUserMessageId(messages: readonly ChatMessage[]): string | undefined {
  return [...messages]
    .reverse()
    .find((message) => message.role === "user" && message.content.trim())?.id;
}
