import type { ChatSessionRecord } from "./chat-session.js";
import { resolveChatSessionClassification } from "./chat-session-context.js";

/** Shared confidence band for route / tidy / sweep nomination. */
export const AFFINITY_CONFIDENCE = ["high", "medium", "low"] as const;
export type AffinityConfidence = (typeof AFFINITY_CONFIDENCE)[number];

export const AFFINITY_CORE_REASONS = [
  "same_responsibility",
  "shared_refs",
  "similar_intent",
  "title_overlap",
] as const;
export type AffinityCoreReason = (typeof AFFINITY_CORE_REASONS)[number];

export const TOKEN_RE = /[a-zA-Z0-9_\u4e00-\u9fff./-]{2,}/gu;
export const PATH_RE = /\b[\w./-]+\.(?:ts|tsx|js|jsx|py|go|rs|css|json|md)\b/gu;

export function tokenizeAffinityText(text: string): Set<string> {
  const out = new Set<string>();
  for (const match of text.toLowerCase().matchAll(TOKEN_RE)) {
    const token = match[0]?.replace(/^\/+|\/+$/gu, "") ?? "";
    if (token.length >= 2) out.add(token);
  }
  return out;
}

export function jaccardAffinity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const token of a) if (b.has(token)) inter += 1;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

export function intersectionSizeAffinity(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const token of a) if (b.has(token)) n += 1;
  return n;
}

export function buildSessionTextBlob(
  record: ChatSessionRecord,
  options: { userSlice?: "first" | "last"; userLimit?: number } = {},
): string {
  const userLimit = options.userLimit ?? 3;
  const users = record.messages.filter((message) => message.role === "user");
  const sliced =
    options.userSlice === "last" ? users.slice(-userLimit) : users.slice(0, userLimit);
  return [
    record.head.title,
    record.head.responsibility ?? "",
    record.contextDigest?.responsibility ?? "",
    ...(record.contextDigest?.decisions ?? []),
    ...(record.contextDigest?.refs ?? []),
    ...(record.head.previewStrip ?? []).map((item) => item.title),
    ...sliced.map((message) => message.content),
  ].join("\n");
}

export function buildSessionRefSet(record: ChatSessionRecord): Set<string> {
  const refs = new Set<string>();
  for (const ref of record.contextDigest?.refs ?? []) {
    for (const token of tokenizeAffinityText(ref)) refs.add(token);
  }
  for (const match of buildSessionTextBlob(record).matchAll(PATH_RE)) {
    refs.add(match[0]!.toLowerCase());
  }
  return refs;
}

export function buildPromptRefSet(prompt: string): Set<string> {
  const refs = new Set<string>();
  for (const match of prompt.matchAll(PATH_RE)) {
    refs.add(match[0]!.toLowerCase());
  }
  return refs;
}

export interface AffinityPairScore {
  score: number;
  reasons: Array<AffinityCoreReason | "time_adjacent">;
}

const TIME_ADJACENT_MS = 72 * 60 * 60 * 1000;

/** Session↔session affinity used by continuity tidy. */
export function scoreSessionPair(
  a: ChatSessionRecord,
  b: ChatSessionRecord,
): AffinityPairScore {
  const reasons: AffinityPairScore["reasons"] = [];
  let score = 0;

  const respA = (a.head.responsibility ?? a.contextDigest?.responsibility ?? "").trim();
  const respB = (b.head.responsibility ?? b.contextDigest?.responsibility ?? "").trim();
  if (respA && respB) {
    const sim = jaccardAffinity(tokenizeAffinityText(respA), tokenizeAffinityText(respB));
    if (sim >= 0.35) {
      score += 0.35 * sim;
      reasons.push("same_responsibility");
    }
  }

  const sharedRefs = intersectionSizeAffinity(buildSessionRefSet(a), buildSessionRefSet(b));
  if (sharedRefs > 0) {
    score += Math.min(0.35, 0.12 * sharedRefs);
    reasons.push("shared_refs");
  }

  const intentA = tokenizeAffinityText(
    [a.head.title, ...(a.head.previewStrip ?? []).map((item) => item.title)].join(" "),
  );
  const intentB = tokenizeAffinityText(
    [b.head.title, ...(b.head.previewStrip ?? []).map((item) => item.title)].join(" "),
  );
  const intentSim = jaccardAffinity(intentA, intentB);
  if (intentSim >= 0.3) {
    score += 0.25 * intentSim;
    reasons.push("similar_intent");
  }

  const titleSim = jaccardAffinity(
    tokenizeAffinityText(a.head.title),
    tokenizeAffinityText(b.head.title),
  );
  if (titleSim >= 0.4) {
    score += 0.2 * titleSim;
    reasons.push("title_overlap");
  }

  const ta = Date.parse(a.head.lastUpdatedAt);
  const tb = Date.parse(b.head.lastUpdatedAt);
  if (Number.isFinite(ta) && Number.isFinite(tb) && Math.abs(ta - tb) <= TIME_ADJACENT_MS) {
    score += 0.12;
    reasons.push("time_adjacent");
  }

  score +=
    0.15 *
    jaccardAffinity(
      tokenizeAffinityText(buildSessionTextBlob(a, { userSlice: "first" })),
      tokenizeAffinityText(buildSessionTextBlob(b, { userSlice: "first" })),
    );

  return { score, reasons: [...new Set(reasons)] };
}

export interface AffinityPromptScore {
  score: number;
  reasons: Array<
    AffinityCoreReason | "continuation_cue" | "branch_cue" | "active_session"
  >;
}

const CONTINUATION_CUE =
  /继续|接着|还是那个|同一(?:个)?|刚才那个|跟上一次|follow[- ]?up|continue|same (?:feature|session|thread)/iu;

/** Prompt↔session affinity used by smart route (core signals only; cues added by caller). */
export function scorePromptAgainstSessionCore(
  prompt: string,
  record: ChatSessionRecord,
  options: { activeSessionId?: string | null } = {},
): AffinityPromptScore {
  const reasons: AffinityPromptScore["reasons"] = [];
  let score = 0;
  const promptTokens = tokenizeAffinityText(prompt);
  const promptRefs = buildPromptRefSet(prompt);

  const responsibility = (
    record.head.responsibility ??
    record.contextDigest?.responsibility ??
    ""
  ).trim();
  if (responsibility) {
    const sim = jaccardAffinity(promptTokens, tokenizeAffinityText(responsibility));
    if (sim >= 0.25) {
      score += 0.34 * sim;
      reasons.push("same_responsibility");
    }
  }

  const sharedRefs = intersectionSizeAffinity(promptRefs, buildSessionRefSet(record));
  if (sharedRefs > 0) {
    score += Math.min(0.36, 0.14 * sharedRefs);
    reasons.push("shared_refs");
  }

  const intentTokens = tokenizeAffinityText(
    [record.head.title, ...(record.head.previewStrip ?? []).map((item) => item.title)].join(
      " ",
    ),
  );
  const intentSim = jaccardAffinity(promptTokens, intentTokens);
  if (intentSim >= 0.28) {
    score += 0.28 * intentSim;
    reasons.push("similar_intent");
  }

  const titleSim = jaccardAffinity(promptTokens, tokenizeAffinityText(record.head.title));
  if (titleSim >= 0.35) {
    score += 0.2 * titleSim;
    reasons.push("title_overlap");
  }

  score +=
    0.12 *
    jaccardAffinity(
      promptTokens,
      tokenizeAffinityText(buildSessionTextBlob(record, { userSlice: "last" })),
    );

  if (CONTINUATION_CUE.test(prompt)) {
    score += 0.08;
    reasons.push("continuation_cue");
  }

  if (options.activeSessionId && record.head.id === options.activeSessionId) {
    score += 0.06;
    reasons.push("active_session");
  }

  if (resolveChatSessionClassification(record.head) === "misc") {
    score *= 0.85;
  }

  return { score, reasons: [...new Set(reasons)] };
}

const HIGH_SCORE = 0.5;
const HIGH_GAP = 0.06;
const VERY_HIGH = 0.65;
const MATCH_FLOOR = 0.35;

export function mapAffinityConfidence(
  bestScore: number,
  secondScore: number,
  reasons: readonly string[],
  options: { matchFloor?: number } = {},
): AffinityConfidence {
  const floor = options.matchFloor ?? MATCH_FLOOR;
  if (bestScore < floor) return "low";
  const gap = bestScore - secondScore;
  const strongSignals =
    reasons.includes("shared_refs") &&
    (reasons.includes("same_responsibility") ||
      reasons.includes("continuation_cue") ||
      reasons.includes("similar_intent"));
  if (bestScore >= VERY_HIGH) return "high";
  if (bestScore >= HIGH_SCORE && gap >= HIGH_GAP) return "high";
  if (strongSignals && gap >= HIGH_GAP && bestScore >= floor + 0.05) return "high";
  if (bestScore >= floor) return "medium";
  return "low";
}

export { HIGH_SCORE, HIGH_GAP, VERY_HIGH, MATCH_FLOOR, CONTINUATION_CUE };
