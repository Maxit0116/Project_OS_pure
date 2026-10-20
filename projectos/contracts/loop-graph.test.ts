import { describe, expect, it } from "vitest";

import {
  IntentGraphSchema,
  LoopSpecSchema,
  createEmptyLoopDocument,
  getIntentGraphCompileIssues,
  headFromLoopDocument,
  isIntentGraphReadyForCompile,
  normalizeLoopGraphDocument,
  pushIntentGraphHistory,
  summarizeGoalContextForGraphPrompt,
  suggestIntentEdgeKind,
  trimLoopInstanceEvents,
  validateLoopSpecTopology,
} from "./loop-graph.js";

function sampleSpec(overrides: Record<string, unknown> = {}) {
  return LoopSpecSchema.parse({
    version: "spec_1",
    graphRevision: 1,
    goal: "Implement and verify login",
    nodes: [
      {
        id: "n1",
        role: "implement",
        goal: "Implement login",
        constraints: ["Do not change DB schema"],
        inputs: [],
        outputs: ["login API"],
        acceptance: [
          {
            id: "a1",
            description: "Login endpoint exists",
            kind: "machine",
          },
        ],
      },
      {
        id: "n2",
        role: "verify",
        goal: "Verify login",
        constraints: [],
        inputs: ["login API"],
        outputs: ["evidence"],
        acceptance: [
          {
            id: "a2",
            description: "Login tests pass",
            kind: "machine",
          },
        ],
      },
    ],
    edges: [
      { id: "e1", from: "n1", to: "n2", kind: "depends" },
      {
        id: "e2",
        from: "n2",
        to: "n1",
        kind: "feedback",
        when: "verification failed",
      },
    ],
    acceptance: [
      {
        id: "g1",
        description: "Login works end to end",
        kind: "human",
      },
    ],
    retryPolicy: { onFailure: "retry", maxAutoRetries: 3 },
    stopPolicy: { maxRounds: 5 },
    permissions: [],
    openQuestions: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  });
}

describe("loop-graph contracts", () => {
  it("creates an empty document and derives draft head status", () => {
    const doc = createEmptyLoopDocument({
      id: "loop_1",
      projectId: "proj_1",
      title: "Login loop",
      now: "2026-01-01T00:00:00.000Z",
    });
    expect(doc.draft.revision).toBe(0);
    expect(doc.composerMode).toBe("ask");
    expect(doc.authoringThread).toEqual([]);
    expect(doc.authoringTrace.status).toBe("idle");
    expect(doc.draftHistory).toEqual([]);
    expect(headFromLoopDocument(doc)).toMatchObject({
      id: "loop_1",
      title: "Login loop",
      status: "draft",
      draftRevision: 0,
    });
  });

  it("normalizes legacy documents missing authoring fields", () => {
    const legacy = {
      version: "0.1.0",
      id: "loop_legacy",
      projectId: "proj_1",
      title: "Legacy",
      draft: {
        revision: 0,
        graphPrompt: "",
        nodes: [],
        edges: [],
      },
      approvedSpecs: [],
      instances: [],
      linkedSessionIds: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const doc = normalizeLoopGraphDocument(legacy);
    expect(doc.composerMode).toBe("ask");
    expect(doc.authoringThread).toEqual([]);
    expect(doc.draftHistory).toEqual([]);
    expect(doc.authoringTrace).toMatchObject({ status: "idle", steps: [] });
  });

  it("summarizes goal context into graphPrompt text and caps history", () => {
    const text = summarizeGoalContextForGraphPrompt({
      goal: "Ship login",
      constraints: ["No schema change"],
      doneWhen: ["Tests pass"],
      outOfScope: ["SSO"],
      openQuestions: [],
      status: "confirmed",
      revision: 1,
      updatedAt: "2026-01-01T00:00:00.000Z",
      sourceThreadLength: 2,
    });
    expect(text).toContain("Ship login");
    expect(text).toContain("Constraints:");
    const history = pushIntentGraphHistory(
      Array.from({ length: 20 }, (_, i) => ({
        id: `h${i}`,
        at: "2026-01-01T00:00:00.000Z",
        label: `step ${i}`,
        draft: { revision: i, graphPrompt: "", nodes: [], edges: [] },
      })),
      {
        id: "h_new",
        at: "2026-01-01T00:00:00.000Z",
        label: "edit",
        draft: { revision: 21, graphPrompt: "", nodes: [], edges: [] },
      },
    );
    expect(history).toHaveLength(20);
    expect(history[history.length - 1]?.id).toBe("h_new");
  });

  it("accepts a linear chain with one feedback edge", () => {
    expect(validateLoopSpecTopology(sampleSpec())).toEqual([]);
  });

  it("parses optional authoringSessionId and ports on nodes and edges", () => {
    const draft = IntentGraphSchema.parse({
      revision: 1,
      graphPrompt: "Ship login",
      nodes: [
        {
          id: "n1",
          title: "Untitled",
          prompt: "Implement login",
          position: { x: 0, y: 0 },
          authoringSessionId: "chat_1",
        },
      ],
      edges: [
        {
          id: "e1",
          source: "n1",
          target: "n1",
          prompt: "retry on fail",
          kind: "feedback",
          sourcePort: "e",
          targetPort: "w",
          authoringSessionId: "chat_2",
        },
      ],
    });
    expect(draft.nodes[0]?.authoringSessionId).toBe("chat_1");
    expect(draft.edges[0]?.authoringSessionId).toBe("chat_2");
    expect(draft.edges[0]?.sourcePort).toBe("e");
    expect(draft.edges[0]?.targetPort).toBe("w");
  });

  it("hard-blocks compile when node or edge semantics are incomplete", () => {
    const incomplete = IntentGraphSchema.parse({
      revision: 0,
      graphPrompt: "",
      nodes: [
        {
          id: "n1",
          title: "Untitled",
          prompt: "",
          position: { x: 0, y: 0 },
        },
        {
          id: "n2",
          title: "Verify",
          prompt: "Check login",
          position: { x: 40, y: 40 },
        },
      ],
      edges: [{ id: "e1", source: "n1", target: "n2" }],
    });
    expect(isIntentGraphReadyForCompile(incomplete)).toBe(false);
    const issues = getIntentGraphCompileIssues(incomplete);
    expect(issues.some((issue) => issue.path.includes("n1"))).toBe(true);
    expect(issues.some((issue) => issue.path.includes("e1"))).toBe(true);

    const ready = IntentGraphSchema.parse({
      revision: 1,
      graphPrompt: "Ship login",
      nodes: [
        {
          id: "n1",
          title: "Implement",
          prompt: "Build login",
          position: { x: 0, y: 0 },
        },
        {
          id: "n2",
          title: "Verify",
          prompt: "Check login",
          position: { x: 40, y: 40 },
        },
      ],
      edges: [
        {
          id: "e1",
          source: "n1",
          target: "n2",
          prompt: "After implement, verify",
          kind: "depends",
        },
      ],
    });
    expect(isIntentGraphReadyForCompile(ready)).toBe(true);
    expect(getIntentGraphCompileIssues(ready)).toEqual([]);
  });

  it("suggests feedback edge kind from verify back to implement", () => {
    const kind = suggestIntentEdgeKind(
      { source: "n2", target: "n1" },
      [
        {
          id: "n1",
          title: "Implement",
          prompt: "Build it",
          role: "implement",
          position: { x: 0, y: 0 },
        },
        {
          id: "n2",
          title: "Verify",
          prompt: "Check it",
          role: "verify",
          position: { x: 0, y: 80 },
        },
      ],
    );
    expect(kind).toBe("feedback");
  });

  it("rejects branching depends edges and multiple feedback edges", () => {
    const branched = sampleSpec({
      nodes: [
        ...sampleSpec().nodes,
        {
          id: "n3",
          role: "implement",
          goal: "Extra",
          constraints: [],
          inputs: [],
          outputs: [],
          acceptance: [],
        },
      ],
      edges: [
        { id: "e1", from: "n1", to: "n2", kind: "depends" },
        { id: "e3", from: "n1", to: "n3", kind: "depends" },
        { id: "e2", from: "n2", to: "n1", kind: "feedback" },
        { id: "e4", from: "n3", to: "n1", kind: "feedback" },
      ],
    });
    const issues = validateLoopSpecTopology(branched);
    expect(issues.some((issue) => issue.message.includes("outdegree"))).toBe(true);
    expect(issues.some((issue) => issue.message.includes("At most one feedback"))).toBe(
      true,
    );
  });

  it("keeps the started event when trimming the instance log", () => {
    const started = {
      id: "evt_started",
      at: "2026-01-01T00:00:00.000Z",
      type: "started" as const,
    };
    const rest = Array.from({ length: 5 }, (_, index) => ({
      id: `evt_${index}`,
      at: "2026-01-01T00:00:01.000Z",
      type: "message" as const,
      message: `m${index}`,
    }));
    const trimmed = trimLoopInstanceEvents([started, ...rest], 3);
    expect(trimmed.map((event) => event.id)).toEqual(["evt_started", "evt_3", "evt_4"]);
  });
});
