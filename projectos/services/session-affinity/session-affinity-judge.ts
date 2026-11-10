import type { ChatSessionRecord } from "../../contracts/chat-session.js";
import type { ModelProfile } from "../../contracts/settings.js";
import {
  AFFINITY_LLM_DAILY_BUDGET,
  AFFINITY_LLM_SWEEP_BUDGET,
  AFFINITY_ROUTE_TIMEOUT_MS,
  buildAffinitySessionCard,
  parseAffinityJudgeOutput,
  shouldJudgeRouteSuggestion,
  shouldJudgeSweepCandidate,
  shouldJudgeTidyCluster,
  type AffinityJudgeResult,
  type AffinityMode,
} from "../../contracts/session-affinity-llm.js";
import type { SessionRouteSuggestion } from "../../contracts/session-route.js";
import type { SessionSweepPlan } from "../../contracts/session-sweep.js";
import type { SessionTidyPlan } from "../../contracts/session-continuity.js";
import { ModelGateway } from "../model-gateway/index.js";

const TIDY_SYSTEM = `You review whether scattered chat sessions should be clustered as the same feature.
Return JSON only:
{"decision":"confirm"|"reject"|"uncertain","confidence":"high"|"medium"|"low","rationale":"","anchorSessionId":"","memberActions":[{"sessionId":"","action":"attach"|"rehome"|"absorb"|"leave"}]}
confirm = same feature, keep the tidy cluster.
reject/uncertain = do not nominate this cluster.
Keep rationale under 120 characters. No markdown fences.`;

const SWEEP_SYSTEM = `You review whether a chat session is low-value and safe to nominate for cleanup.
Return JSON only:
{"decision":"confirm"|"reject"|"uncertain","confidence":"high"|"medium"|"low","rationale":"","sweepAction":"delete"|"reorganize"|"keep"}
confirm+delete/reorganize = nominate for cleanup.
keep or reject/uncertain = do not delete.
Prefer keep when the session is short but clearly related to real work.
Keep rationale under 120 characters. No markdown fences.`;

const ROUTE_SYSTEM = `You review which existing chat session a developer prompt should go to.
Return JSON only:
{"decision":"confirm"|"reject"|"uncertain","confidence":"high"|"medium"|"low","rationale":"","routeAction":"stay"|"switch"|"branch","targetSessionId":"","forkMessageId":""}
confirm applies your routeAction/targetSessionId.
reject means stay without switching.
Keep rationale under 120 characters. No markdown fences.`;

export interface SessionAffinityJudgeDeps {
  gateway: ModelGateway;
  profile: ModelProfile | null;
  projectId: string;
  mode: AffinityMode;
  /** Calls already used today before this batch. */
  callsUsedToday: number;
}

async function completeJudge(
  deps: SessionAffinityJudgeDeps,
  systemPrompt: string,
  card: Record<string, unknown>,
  maxTokens: number,
): Promise<AffinityJudgeResult | null> {
  if (!deps.profile || deps.mode === "off") return null;
  if (deps.callsUsedToday >= AFFINITY_LLM_DAILY_BUDGET[deps.mode]) return null;
  try {
    const response = await deps.gateway.complete(deps.profile, {
      projectId: deps.projectId,
      requestKind: "chat_title",
      modelPreference: deps.profile.id,
      systemPrompt,
      input: { affinityCard: card },
      redactionPolicy: "secrets_and_paths",
      maxOutputTokens: maxTokens,
      thinkingDepth: "off",
    });
    return parseAffinityJudgeOutput(response.output);
  } catch (error) {
    console.error("[projectos] session affinity judge failed", error);
    return null;
  }
}

export async function judgeTidyClusters(
  plan: SessionTidyPlan,
  recordsById: Map<string, ChatSessionRecord>,
  deps: SessionAffinityJudgeDeps,
): Promise<{ judgments: Map<string, AffinityJudgeResult>; calls: number }> {
  const judgments = new Map<string, AffinityJudgeResult>();
  let calls = 0;
  if (deps.mode === "off" || !deps.profile) return { judgments, calls };

  for (const cluster of plan.clusters) {
    if (deps.callsUsedToday + calls >= AFFINITY_LLM_DAILY_BUDGET[deps.mode]) break;
    if (!shouldJudgeTidyCluster(deps.mode, cluster.score)) continue;

    const members = cluster.members
      .map((member) => recordsById.get(member.sessionId))
      .filter((record): record is ChatSessionRecord => Boolean(record))
      .map((record) => buildAffinitySessionCard(record));

    const result = await completeJudge(
      { ...deps, callsUsedToday: deps.callsUsedToday + calls },
      TIDY_SYSTEM,
      {
        kind: "tidy",
        clusterId: cluster.id,
        label: cluster.label,
        score: cluster.score,
        defaultAnchorSessionId: cluster.anchorSessionId,
        members,
      },
      deps.mode === "accurate" ? 700 : 450,
    );
    calls += 1;
    if (result) judgments.set(cluster.id, result);
  }

  return { judgments, calls };
}

export async function judgeSweepCandidates(
  plan: SessionSweepPlan,
  recordsById: Map<string, ChatSessionRecord>,
  deps: SessionAffinityJudgeDeps,
): Promise<{ judgments: Map<string, AffinityJudgeResult>; calls: number }> {
  const judgments = new Map<string, AffinityJudgeResult>();
  let calls = 0;
  if (deps.mode === "off" || !deps.profile) return { judgments, calls };

  const sweepBudget = AFFINITY_LLM_SWEEP_BUDGET[deps.mode];
  let sweepCalls = 0;

  for (const candidate of plan.candidates) {
    if (deps.callsUsedToday + calls >= AFFINITY_LLM_DAILY_BUDGET[deps.mode]) break;
    if (sweepCalls >= sweepBudget) break;
    if (!shouldJudgeSweepCandidate(deps.mode, candidate.reasons)) continue;

    const record = recordsById.get(candidate.sessionId);
    if (!record) continue;

    const result = await completeJudge(
      { ...deps, callsUsedToday: deps.callsUsedToday + calls },
      SWEEP_SYSTEM,
      {
        kind: "sweep",
        candidate: {
          ...buildAffinitySessionCard(record),
          reasons: candidate.reasons,
          proposedAction: candidate.action,
        },
      },
      deps.mode === "accurate" ? 500 : 350,
    );
    calls += 1;
    sweepCalls += 1;
    if (result) judgments.set(candidate.sessionId, result);
  }

  return { judgments, calls };
}

export async function judgeRouteSuggestion(
  prompt: string,
  suggestion: SessionRouteSuggestion,
  recordsById: Map<string, ChatSessionRecord>,
  deps: SessionAffinityJudgeDeps,
): Promise<{ judgment: AffinityJudgeResult | null; calls: number }> {
  if (deps.mode === "off" || !deps.profile) return { judgment: null, calls: 0 };
  if (deps.callsUsedToday >= AFFINITY_LLM_DAILY_BUDGET[deps.mode]) {
    return { judgment: null, calls: 0 };
  }
  const secondScore = suggestion.alternatives[1]?.score ?? 0;
  if (
    !shouldJudgeRouteSuggestion(
      deps.mode,
      suggestion.confidence,
      suggestion.score,
      secondScore,
    )
  ) {
    return { judgment: null, calls: 0 };
  }

  const alternatives = suggestion.alternatives
    .slice(0, deps.mode === "accurate" ? 5 : 3)
    .map((item) => {
      const record = recordsById.get(item.sessionId);
      return {
        score: item.score,
        reasons: item.reasons,
        ...(record
          ? buildAffinitySessionCard(record)
          : { id: item.sessionId, title: item.title }),
      };
    });

  const timeoutMs = AFFINITY_ROUTE_TIMEOUT_MS;
  const work = completeJudge(
    deps,
    ROUTE_SYSTEM,
    {
      kind: "route",
      prompt: prompt.trim().slice(0, 500),
      l0: {
        action: suggestion.action,
        targetSessionId: suggestion.targetSessionId,
        confidence: suggestion.confidence,
        score: suggestion.score,
      },
      alternatives,
    },
    deps.mode === "accurate" ? 500 : 350,
  );

  const judgment = await Promise.race([
    work,
    new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), timeoutMs);
    }),
  ]);

  return { judgment, calls: 1 };
}
