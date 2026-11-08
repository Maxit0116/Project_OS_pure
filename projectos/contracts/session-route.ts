import type { ChatMessage, ChatSessionRecord } from "./chat-session.js";
import { resolveChatSessionClassification } from "./chat-session-context.js";

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

const TOKEN_RE = /[a-zA-Z0-9_\u4e00-\u9fff./-]{2,}/gu;
const PATH_RE = /\b[\w./-]+\.(?:ts|tsx|js|jsx|py|go|rs|css|json|md)\b/gu;

const BRANCH_CUE =
  /另(?:一种|做一版|一版|起)|并行|不要改原来|别动主线|对比方案|alternative(?:\s+approach)?|in parallel|don'?t (?:change|touch) (?:the )?main|fork (?:off|from)|branch off/iu;

const CONTINUATION_CUE =
  /继续|接着|还是那个|同一(?:个)?|刚才那个|跟上一次|follow[- ]?up|continue|same (?:feature|session|thread)/iu;

const HIGH_SCORE = 0.5;
const HIGH_GAP = 0.06;
const VERY_HIGH = 0.65;
const MATCH_FLOOR = 0.35;

function tokenize(text: string): Set<string> {
  const out = new Set<string>();
  for (const match of text.toLowerCase().matchAll(TOKEN_RE)) {
    const token = match[0]?.replace(/^\/+|\/+$/gu, "") ?? "";
    if (token.length >= 2) out.add(token);
  }
  return out;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const token of a) if (b.has(token)) inter += 1;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

function intersectionSize(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const token of a) if (b.has(token)) n += 1;
  return n;
}

function promptRefSet(prompt: string): Set<string> {
  const refs = new Set<string>();
  for (const match of prompt.matchAll(PATH_RE)) {
    refs.add(match[0]!.toLowerCase());
  }
  return refs;
}

function sessionBlob(record: ChatSessionRecord): string {
  return [
    record.head.title,
    record.head.responsibility ?? "",
    record.contextDigest?.responsibility ?? "",
    ...(record.contextDigest?.decisions ?? []),
    ...(record.contextDigest?.refs ?? []),
    ...(record.head.previewStrip ?? []).map((item) => item.title),
    ...record.messages
      .filter((message) => message.role === "user")
      .slice(-3)
      .map((message) => message.content),
  ].join("\n");
}

function sessionRefSet(record: ChatSessionRecord): Set<string> {
  const refs = new Set<string>();
  for (const ref of record.contextDigest?.refs ?? []) {
    for (const token of tokenize(ref)) refs.add(token);
  }
  for (const match of sessionBlob(record).matchAll(PATH_RE)) {
    refs.add(match[0]!.toLowerCase());
  }
  return refs;
}

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
  promptTokens: Set<string>,
  promptRefs: Set<string>,
  record: ChatSessionRecord,
  activeSessionId: string | null,
): SessionRouteCandidate {
  const reasons: SessionRouteReason[] = [];
  let score = 0;

  const responsibility = (
    record.head.responsibility ??
    record.contextDigest?.responsibility ??
    ""
  ).trim();
  if (responsibility) {
    const sim = jaccard(promptTokens, tokenize(responsibility));
    if (sim >= 0.25) {
      score += 0.34 * sim;
      reasons.push("same_responsibility");
    }
  }

  const sharedRefs = intersectionSize(promptRefs, sessionRefSet(record));
  if (sharedRefs > 0) {
    score += Math.min(0.36, 0.14 * sharedRefs);
    reasons.push("shared_refs");
  }

  const intentTokens = tokenize(
    [record.head.title, ...(record.head.previewStrip ?? []).map((i) => i.title)].join(" "),
  );
  const intentSim = jaccard(promptTokens, intentTokens);
  if (intentSim >= 0.28) {
    score += 0.28 * intentSim;
    reasons.push("similar_intent");
  }

  const titleSim = jaccard(promptTokens, tokenize(record.head.title));
  if (titleSim >= 0.35) {
    score += 0.2 * titleSim;
    reasons.push("title_overlap");
  }

  score += 0.12 * jaccard(promptTokens, tokenize(sessionBlob(record)));

  if (CONTINUATION_CUE.test(prompt)) {
    score += 0.08;
    reasons.push("continuation_cue");
  }

  if (activeSessionId && record.head.id === activeSessionId) {
    score += 0.06;
    reasons.push("active_session");
  }

  // Misc sessions rank slightly lower unless they are the only match.
  if (resolveChatSessionClassification(record.head) === "misc") {
    score *= 0.85;
  }

  // Busy sessions: still matchable but never auto-switch into them (handled later).
  const forkMessageId = resolveForkMessageId(record);

  return {
    sessionId: record.head.id,
    title: record.head.title.trim() || record.head.id,
    score,
    reasons: [...new Set(reasons)],
    ...(forkMessageId ? { forkMessageId } : {}),
  };
}

function confidenceFor(
  best: SessionRouteCandidate,
  secondScore: number,
): SessionRouteConfidence {
  if (best.score < MATCH_FLOOR) return "low";
  const gap = best.score - secondScore;
  const strongSignals =
    best.reasons.includes("shared_refs") &&
    (best.reasons.includes("same_responsibility") ||
      best.reasons.includes("continuation_cue") ||
      best.reasons.includes("similar_intent"));
  if (best.score >= VERY_HIGH) return "high";
  if (best.score >= HIGH_SCORE && gap >= HIGH_GAP) return "high";
  // Clear feature hit with a decisive lead counts as high even mid-band.
  if (strongSignals && gap >= HIGH_GAP && best.score >= MATCH_FLOOR + 0.05) {
    return "high";
  }
  if (best.score >= MATCH_FLOOR) return "medium";
  return "low";
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
    // Branch from the matched anchor (even if it's the active session).
    return "branch";
  }

  if (activeSessionId && best.sessionId === activeSessionId) return "stay";

  const target = recordById.get(best.sessionId);
  if (
    target &&
    (target.head.status === "running" || target.head.status === "awaiting_review")
  ) {
    // Don't interrupt a busy session — branch instead when confidence allows.
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

  const promptTokens = tokenize(trimmed);
  const promptRefs = promptRefSet(trimmed);
  const recordById = new Map(records.map((record) => [record.head.id, record]));

  const candidates = records
    .filter((record) => !record.head.isArchived)
    .map((record) =>
      scorePromptAgainstSession(
        trimmed,
        promptTokens,
        promptRefs,
        record,
        activeSessionId,
      ),
    )
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

  // If branch but no fork point and target is empty, fall back to switch/stay.
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
