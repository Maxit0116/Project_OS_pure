import { describe, expect, it } from "vitest";
import type { ChatSessionRecord } from "./chat-session.js";
import {
  mapAffinityConfidence,
  scorePromptAgainstSessionCore,
  scoreSessionPair,
} from "./session-affinity.js";
import {
  parseAffinityJudgeOutput,
  refineRouteSuggestionWithJudgment,
  refineSweepPlanWithJudgments,
  refineTidyPlanWithJudgments,
  shouldJudgeRouteSuggestion,
  shouldJudgeSweepCandidate,
  shouldJudgeTidyCluster,
} from "./session-affinity-llm.js";
import type { SessionRouteSuggestion } from "./session-route.js";
import type { SessionSweepPlan } from "./session-sweep.js";
import type { SessionTidyPlan } from "./session-continuity.js";

function record(
  partial: Partial<ChatSessionRecord["head"]> & { id: string },
  messages: ChatSessionRecord["messages"] = [],
  extra: Partial<Pick<ChatSessionRecord, "contextDigest">> = {},
): ChatSessionRecord {
  const now = "2026-11-08T12:00:00.000Z";
  return {
    version: "0.2.0",
    head: {
      id: partial.id,
      title: partial.title ?? partial.id,
      createdAt: now,
      lastUpdatedAt: partial.lastUpdatedAt ?? now,
      chatMode: "ask",
      isArchived: false,
      status: "idle",
      classification: partial.classification ?? "topic",
      ...(partial.responsibility ? { responsibility: partial.responsibility } : {}),
      ...(partial.graphId ? { graphId: partial.graphId } : {}),
    },
    messages,
    ...extra,
  };
}

describe("session affinity L0", () => {
  it("scores same responsibility and shared refs", () => {
    const a = record(
      { id: "a", title: "Auth", responsibility: "Fix login redirect", graphId: "g1" },
      [],
      {
        contextDigest: {
          responsibility: "Fix login redirect",
          decisions: [],
          openQuestions: [],
          refs: ["app/login.tsx"],
          updatedAt: "2026-11-08T12:00:00.000Z",
          throughMessageId: "m1",
        },
      },
    );
    const b = record(
      { id: "b", title: "Login", responsibility: "Fix login redirect", graphId: "g1" },
      [],
      {
        contextDigest: {
          responsibility: "Fix login redirect",
          decisions: [],
          openQuestions: [],
          refs: ["app/login.tsx"],
          updatedAt: "2026-11-08T12:00:00.000Z",
          throughMessageId: "m2",
        },
      },
    );
    const scored = scoreSessionPair(a, b);
    expect(scored.reasons).toContain("same_responsibility");
    expect(scored.reasons).toContain("shared_refs");
    expect(scored.score).toBeGreaterThan(0.4);
  });

  it("maps confidence with a decisive lead", () => {
    expect(mapAffinityConfidence(0.7, 0.4, ["shared_refs", "same_responsibility"])).toBe(
      "high",
    );
    expect(mapAffinityConfidence(0.4, 0.38, ["similar_intent"])).toBe("medium");
    expect(mapAffinityConfidence(0.2, 0.1, [])).toBe("low");
  });

  it("scores a prompt against a session", () => {
    const session = record(
      { id: "a", title: "Login redirect", responsibility: "Fix login redirect" },
      [{ id: "u1", role: "user", content: "look at app/login.tsx", timestamp: "2026-11-08T12:00:00.000Z" }],
    );
    const scored = scorePromptAgainstSessionCore("continue the login redirect in app/login.tsx", session, {
      activeSessionId: "a",
    });
    expect(scored.reasons).toEqual(
      expect.arrayContaining(["shared_refs", "continuation_cue", "active_session"]),
    );
  });
});

describe("session affinity L1 gates + refine", () => {
  it("gates tidy/sweep/route by mode", () => {
    expect(shouldJudgeTidyCluster("off", 0.5)).toBe(false);
    expect(shouldJudgeTidyCluster("balanced", 0.5)).toBe(true);
    expect(shouldJudgeTidyCluster("balanced", 0.7)).toBe(false);
    expect(shouldJudgeTidyCluster("accurate", 0.7)).toBe(true);

    expect(shouldJudgeSweepCandidate("balanced", ["misc", "trivial"])).toBe(false);
    expect(shouldJudgeSweepCandidate("balanced", ["short_oneshot"])).toBe(true);
    expect(shouldJudgeSweepCandidate("accurate", ["misc", "trivial"])).toBe(true);

    expect(shouldJudgeRouteSuggestion("balanced", "medium", 0.45, 0.4)).toBe(true);
    expect(shouldJudgeRouteSuggestion("balanced", "high", 0.7, 0.5)).toBe(false);
    expect(shouldJudgeRouteSuggestion("accurate", "high", 0.7, 0.5)).toBe(true);
  });

  it("parses judge JSON and rejects bad payloads", () => {
    expect(
      parseAffinityJudgeOutput(
        '{"decision":"confirm","confidence":"high","rationale":"Same feature"}',
      ),
    ).toEqual(
      expect.objectContaining({
        decision: "confirm",
        confidence: "high",
        rationale: "Same feature",
      }),
    );
    expect(parseAffinityJudgeOutput("not json")).toBeNull();
  });

  it("drops rejected tidy clusters and keeps confirmed ones", () => {
    const plan: SessionTidyPlan = {
      generatedAt: "2026-11-09T00:00:00.000Z",
      clusters: [
        {
          id: "tidy_a_b",
          label: "Login",
          anchorSessionId: "a",
          score: 0.5,
          defaultAction: "attach",
          members: [
            {
              sessionId: "a",
              title: "A",
              role: "anchor",
              suggestedAction: "attach",
              reasons: ["same_responsibility"],
            },
            {
              sessionId: "b",
              title: "B",
              role: "satellite",
              suggestedAction: "attach",
              reasons: ["same_responsibility"],
            },
          ],
        },
        {
          id: "tidy_c_d",
          label: "Other",
          anchorSessionId: "c",
          score: 0.48,
          defaultAction: "attach",
          members: [
            {
              sessionId: "c",
              title: "C",
              role: "anchor",
              suggestedAction: "attach",
              reasons: ["title_overlap"],
            },
            {
              sessionId: "d",
              title: "D",
              role: "satellite",
              suggestedAction: "attach",
              reasons: ["title_overlap"],
            },
          ],
        },
      ],
    };
    const judgments = new Map([
      [
        "tidy_a_b",
        {
          decision: "confirm" as const,
          confidence: "high" as const,
          rationale: "Same login work",
        },
      ],
      [
        "tidy_c_d",
        {
          decision: "reject" as const,
          confidence: "high" as const,
          rationale: "Unrelated",
        },
      ],
    ]);
    const refined = refineTidyPlanWithJudgments(plan, judgments, "balanced");
    expect(refined.clusters.map((cluster) => cluster.id)).toEqual(["tidy_a_b"]);
    expect(refined.clusters[0]?.llmSource).toBe("llm");
    expect(refined.clusters[0]?.defaultChecked).toBe(true);
  });

  it("keeps sweep candidates only when confirmed and not keep", () => {
    const plan: SessionSweepPlan = {
      generatedAt: "2026-11-09T00:00:00.000Z",
      candidates: [
        {
          sessionId: "junk",
          title: "hi",
          reasons: ["short_oneshot"],
          action: "delete",
          retainedChildIds: [],
          deleteIds: ["junk"],
        },
        {
          sessionId: "keepme",
          title: "short but real",
          reasons: ["no_decisions"],
          action: "delete",
          retainedChildIds: [],
          deleteIds: ["keepme"],
        },
      ],
    };
    const judgments = new Map([
      [
        "junk",
        {
          decision: "confirm" as const,
          confidence: "high" as const,
          rationale: "Greeting only",
          sweepAction: "delete" as const,
        },
      ],
      [
        "keepme",
        {
          decision: "confirm" as const,
          confidence: "high" as const,
          rationale: "Real work",
          sweepAction: "keep" as const,
        },
      ],
    ]);
    const refined = refineSweepPlanWithJudgments(plan, judgments, "balanced");
    expect(refined.candidates.map((item) => item.sessionId)).toEqual(["junk"]);
  });

  it("refines route with dual-high autoApply rules", () => {
    const suggestion: SessionRouteSuggestion = {
      action: "switch",
      targetSessionId: "a",
      title: "A",
      score: 0.7,
      confidence: "high",
      reasons: ["same_responsibility"],
      alternatives: [
        {
          sessionId: "a",
          title: "A",
          score: 0.7,
          reasons: ["same_responsibility"],
        },
      ],
      autoApply: true,
    };
    const accurate = refineRouteSuggestionWithJudgment(
      suggestion,
      {
        decision: "confirm",
        confidence: "high",
        rationale: "Match",
        routeAction: "switch",
        targetSessionId: "a",
      },
      "accurate",
      { autoApplyHighConfidence: true },
    );
    expect(accurate.autoApply).toBe(true);

    const l0Medium = refineRouteSuggestionWithJudgment(
      { ...suggestion, confidence: "medium", autoApply: false },
      {
        decision: "confirm",
        confidence: "high",
        rationale: "Match",
        routeAction: "switch",
        targetSessionId: "a",
      },
      "accurate",
      { autoApplyHighConfidence: true },
    );
    expect(l0Medium.autoApply).toBe(false);
  });
});
