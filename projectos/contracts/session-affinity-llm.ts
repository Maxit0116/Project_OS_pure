import { z } from "zod";
import type { AffinityConfidence } from "./session-affinity.js";
import type { SessionRouteSuggestion } from "./session-route.js";
import type { SessionSweepCandidate, SessionSweepPlan, SessionSweepReason } from "./session-sweep.js";
import type {
  SessionTidyActionKind,
  SessionTidyCluster,
  SessionTidyMember,
  SessionTidyPlan,
} from "./session-continuity.js";

export const AFFINITY_MODES = ["off", "balanced", "accurate"] as const;
export type AffinityMode = (typeof AFFINITY_MODES)[number];

export function normalizeAffinityMode(value: unknown): AffinityMode {
  if (value === "off" || value === "balanced" || value === "accurate") return value;
  return "balanced";
}

/** Daily LLM call budgets by mode (tidy + sweep + route combined soft cap). */
export const AFFINITY_LLM_DAILY_BUDGET: Record<AffinityMode, number> = {
  off: 0,
  balanced: 24,
  accurate: 80,
};

export const AFFINITY_LLM_SWEEP_BUDGET: Record<AffinityMode, number> = {
  off: 0,
  balanced: 15,
  accurate: 40,
};

export const AFFINITY_ROUTE_TIMEOUT_MS = 600;

/** Tidy fuzzy band around MIN_PAIR_SCORE (0.42) for balanced judging. */
export const TIDY_BALANCED_SCORE_MIN = 0.42;
export const TIDY_BALANCED_SCORE_MAX = 0.58;
export const TIDY_STRONG_SCORE = 0.65;

export const AffinityJudgeDecisionSchema = z.enum(["confirm", "reject", "uncertain"]);
export type AffinityJudgeDecision = z.infer<typeof AffinityJudgeDecisionSchema>;

export const AffinityJudgeConfidenceSchema = z.enum(["high", "medium", "low"]);

export const AffinityJudgeResultSchema = z.object({
  decision: AffinityJudgeDecisionSchema,
  confidence: AffinityJudgeConfidenceSchema,
  rationale: z.string().max(160).default(""),
  anchorSessionId: z.string().min(1).optional(),
  memberActions: z
    .array(
      z.object({
        sessionId: z.string().min(1),
        action: z.enum(["attach", "rehome", "absorb", "leave"]),
      }),
    )
    .optional(),
  sweepAction: z.enum(["delete", "reorganize", "keep"]).optional(),
  routeAction: z.enum(["stay", "switch", "branch"]).optional(),
  targetSessionId: z.string().min(1).optional(),
  forkMessageId: z.string().min(1).optional(),
});

export type AffinityJudgeResult = z.infer<typeof AffinityJudgeResultSchema>;

export type AffinityJudgeKind = "tidy" | "sweep" | "route";

export interface AffinityJudgeRequest {
  kind: AffinityJudgeKind;
  /** Stable cache / budget key. */
  id: string;
  mode: AffinityMode;
  /** Compact card payload for the model. */
  card: Record<string, unknown>;
}

export function parseAffinityJudgeOutput(raw: string): AffinityJudgeResult | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/u);
  const body = (fenced?.[1] ?? trimmed).trim();
  try {
    const parsed = AffinityJudgeResultSchema.safeParse(JSON.parse(body));
    if (!parsed.success) return null;
    return {
      ...parsed.data,
      rationale: clampRationale(parsed.data.rationale),
    };
  } catch {
    return null;
  }
}

function clampRationale(value: string): string {
  const compact = value.replace(/\s+/gu, " ").trim();
  if (compact.length <= 120) return compact;
  return `${compact.slice(0, 119).trimEnd()}…`;
}

export function shouldJudgeTidyCluster(
  mode: AffinityMode,
  score: number,
): boolean {
  if (mode === "off") return false;
  if (mode === "accurate") return score >= TIDY_BALANCED_SCORE_MIN;
  // balanced: only the fuzzy middle band — strong clusters skip LLM.
  if (score >= TIDY_STRONG_SCORE) return false;
  return score >= TIDY_BALANCED_SCORE_MIN && score <= TIDY_BALANCED_SCORE_MAX;
}

const SWEEP_BORDERLINE = new Set<SessionSweepReason>([
  "short_oneshot",
  "no_decisions",
  "explore_oneshot",
  "quiet",
]);

export function shouldJudgeSweepCandidate(
  mode: AffinityMode,
  reasons: readonly SessionSweepReason[],
): boolean {
  if (mode === "off" || reasons.length === 0) return false;
  if (mode === "accurate") return true;
  // balanced: skip obvious misc+trivial double hits; judge borderline singles.
  if (reasons.includes("misc") && reasons.includes("trivial") && reasons.length <= 2) {
    return false;
  }
  if (reasons.length === 1 && SWEEP_BORDERLINE.has(reasons[0]!)) return true;
  if (reasons.includes("short_oneshot") || reasons.includes("no_decisions")) return true;
  return false;
}

export function shouldJudgeRouteSuggestion(
  mode: AffinityMode,
  confidence: AffinityConfidence,
  bestScore: number,
  secondScore: number,
): boolean {
  if (mode === "off") return false;
  if (confidence === "low") return false;
  const gap = bestScore - secondScore;
  if (mode === "accurate") {
    return confidence === "medium" || confidence === "high";
  }
  // balanced: medium, or high with a thin lead.
  if (confidence === "medium") return true;
  return confidence === "high" && gap < 0.08;
}

export interface AffinityLlmMeta {
  llmSource?: "heuristic" | "llm";
  llmRationale?: string;
  llmConfidence?: AffinityConfidence;
  /** Review UI: whether the row should start checked. */
  defaultChecked?: boolean;
}

export type SessionTidyClusterWithLlm = SessionTidyCluster & AffinityLlmMeta;
export type SessionSweepCandidateWithLlm = SessionSweepCandidate & AffinityLlmMeta;

export interface SessionTidyPlanWithLlm extends Omit<SessionTidyPlan, "clusters"> {
  clusters: SessionTidyClusterWithLlm[];
}

export interface SessionSweepPlanWithLlm extends Omit<SessionSweepPlan, "candidates"> {
  candidates: SessionSweepCandidateWithLlm[];
}

export interface SessionRouteSuggestionWithLlm extends SessionRouteSuggestion {
  llmSource?: "heuristic" | "llm";
  llmRationale?: string;
}

export function defaultCheckedForLlmMeta(
  mode: AffinityMode,
  meta: AffinityLlmMeta,
): boolean {
  if (mode === "off" || meta.llmSource !== "llm") return true;
  return meta.llmConfidence === "high" && true;
}

/**
 * Apply tidy judgments. Reject/uncertain drop the cluster (balanced+accurate).
 * Accurate may rewrite anchor / satellite actions when confirm.
 */
export function refineTidyPlanWithJudgments(
  plan: SessionTidyPlan,
  judgments: ReadonlyMap<string, AffinityJudgeResult>,
  mode: AffinityMode,
): SessionTidyPlanWithLlm {
  if (mode === "off") {
    return {
      ...plan,
      clusters: plan.clusters.map((cluster) => ({
        ...cluster,
        llmSource: "heuristic" as const,
        defaultChecked: true,
      })),
    };
  }

  const clusters: SessionTidyClusterWithLlm[] = [];
  for (const cluster of plan.clusters) {
    const judgment = judgments.get(cluster.id);
    if (!judgment) {
      // Not judged (strong L0 or budget) — keep as heuristic.
      clusters.push({
        ...cluster,
        llmSource: "heuristic",
        defaultChecked: true,
      });
      continue;
    }
    if (judgment.decision !== "confirm") continue;

    let next: SessionTidyClusterWithLlm = {
      ...cluster,
      llmSource: "llm",
      ...(judgment.rationale ? { llmRationale: judgment.rationale } : {}),
      llmConfidence: judgment.confidence,
      defaultChecked: judgment.confidence === "high",
    };

    if (mode === "accurate") {
      next = applyAccurateTidyRewrite(next, judgment);
    }
    clusters.push(next);
  }

  return { ...plan, clusters };
}

function applyAccurateTidyRewrite(
  cluster: SessionTidyClusterWithLlm,
  judgment: AffinityJudgeResult,
): SessionTidyClusterWithLlm {
  const anchorId = judgment.anchorSessionId?.trim();
  const actionById = new Map(
    (judgment.memberActions ?? []).map((item) => [item.sessionId, item.action]),
  );

  const adjusted = cluster.members.map((member): SessionTidyMember | null => {
    const action = actionById.get(member.sessionId);
    if (!action || action === "leave") {
      if (action === "leave" && member.role === "satellite") {
        return null;
      }
      return member;
    }
    if (member.role === "anchor") return member;
    return {
      ...member,
      suggestedAction: action as SessionTidyActionKind,
    };
  });
  let members: SessionTidyMember[] = adjusted.filter(
    (member): member is SessionTidyMember => member !== null,
  );

  if (anchorId && members.some((member) => member.sessionId === anchorId)) {
    members = members.map((member) => ({
      ...member,
      role: member.sessionId === anchorId ? ("anchor" as const) : ("satellite" as const),
    }));
    return {
      ...cluster,
      anchorSessionId: anchorId,
      members,
    };
  }

  return { ...cluster, members };
}

/**
 * Apply sweep judgments. Reject/uncertain / keep remove from delete nomination.
 */
export function refineSweepPlanWithJudgments(
  plan: SessionSweepPlan,
  judgments: ReadonlyMap<string, AffinityJudgeResult>,
  mode: AffinityMode,
): SessionSweepPlanWithLlm {
  if (mode === "off") {
    return {
      ...plan,
      candidates: plan.candidates.map((candidate) => ({
        ...candidate,
        llmSource: "heuristic" as const,
        defaultChecked: true,
      })),
    };
  }

  const candidates: SessionSweepCandidateWithLlm[] = [];
  for (const candidate of plan.candidates) {
    const judgment = judgments.get(candidate.sessionId);
    if (!judgment) {
      candidates.push({
        ...candidate,
        llmSource: "heuristic",
        defaultChecked: true,
      });
      continue;
    }
    if (judgment.decision !== "confirm") continue;
    if (judgment.sweepAction === "keep") continue;

    const action =
      judgment.sweepAction === "reorganize"
        ? "reorganize"
        : judgment.sweepAction === "delete"
          ? "delete"
          : candidate.action;

    candidates.push({
      ...candidate,
      action,
      llmSource: "llm",
      ...(judgment.rationale ? { llmRationale: judgment.rationale } : {}),
      llmConfidence: judgment.confidence,
      defaultChecked: judgment.confidence === "high",
    });
  }

  return { ...plan, candidates };
}

export function refineRouteSuggestionWithJudgment(
  suggestion: SessionRouteSuggestion,
  judgment: AffinityJudgeResult | null,
  mode: AffinityMode,
  options: { autoApplyHighConfidence: boolean } = { autoApplyHighConfidence: true },
): SessionRouteSuggestionWithLlm {
  if (mode === "off" || !judgment || judgment.decision === "uncertain") {
    return { ...suggestion, llmSource: "heuristic" };
  }
  if (judgment.decision === "reject") {
    // Fall back to stay on active target already encoded in suggestion alternatives[0] or stay.
    return {
      ...suggestion,
      action: "stay",
      confidence: "low",
      autoApply: false,
      llmSource: "llm",
      ...(judgment.rationale ? { llmRationale: judgment.rationale } : {}),
      reasons: suggestion.reasons,
    };
  }

  const action = judgment.routeAction ?? suggestion.action;
  const targetSessionId = judgment.targetSessionId ?? suggestion.targetSessionId;
  const title =
    suggestion.alternatives.find((item) => item.sessionId === targetSessionId)?.title ??
    suggestion.title;
  const confidence = judgment.confidence;
  // accurate: require dual high (L0 high + L1 high). balanced: L1 high is enough when judged.
  const dualOk =
    mode === "accurate"
      ? suggestion.confidence === "high" && confidence === "high"
      : confidence === "high";

  return {
    ...suggestion,
    action,
    targetSessionId,
    title,
    confidence,
    autoApply: Boolean(options.autoApplyHighConfidence && dualOk),
    llmSource: "llm",
    ...(judgment.rationale ? { llmRationale: judgment.rationale } : {}),
    ...(judgment.forkMessageId ? { forkMessageId: judgment.forkMessageId } : {}),
  };
}

export interface SessionAffinityHygieneJudgeRequest {
  mode: AffinityMode;
  callsUsedToday: number;
  tidyPlan?: SessionTidyPlan | null;
  sweepPlan?: SessionSweepPlan | null;
}

export interface SessionAffinityHygieneJudgeResponse {
  tidyJudgments: Record<string, AffinityJudgeResult>;
  sweepJudgments: Record<string, AffinityJudgeResult>;
  calls: number;
}

export interface SessionAffinityRouteJudgeRequest {
  mode: AffinityMode;
  callsUsedToday: number;
  prompt: string;
  suggestion: SessionRouteSuggestion;
}

export interface SessionAffinityRouteJudgeResponse {
  judgment: AffinityJudgeResult | null;
  calls: number;
}

/** Compact session card for LLM prompts (no full transcript). */
export function buildAffinitySessionCard(record: {
  head: {
    id: string;
    title: string;
    responsibility?: string | undefined;
    classification?: string | undefined;
    parentSessionId?: string | undefined;
    previewStrip?: Array<{ kind: string; title: string }> | undefined;
  };
  contextDigest?: { responsibility?: string | undefined; refs?: string[] | undefined; decisions?: string[] | undefined } | undefined;
  messages: Array<{ role: string; content: string }>;
}): Record<string, unknown> {
  const users = record.messages
    .filter((message) => message.role === "user" && message.content.trim())
    .slice(0, 3)
    .map((message) => message.content.replace(/\s+/gu, " ").trim().slice(0, 120));
  return {
    id: record.head.id,
    title: record.head.title.slice(0, 80),
    responsibility:
      (record.head.responsibility ?? record.contextDigest?.responsibility ?? "").slice(0, 160),
    classification: record.head.classification ?? "topic",
    parentSessionId: record.head.parentSessionId ?? null,
    refs: (record.contextDigest?.refs ?? []).slice(0, 5),
    decisions: (record.contextDigest?.decisions ?? []).slice(0, 3),
    strip: (record.head.previewStrip ?? []).slice(0, 4).map((item) => ({
      kind: item.kind,
      title: item.title.slice(0, 80),
    })),
    recentUserPrompts: users,
  };
}
