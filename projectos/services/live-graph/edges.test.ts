import { describe, expect, it } from "vitest";

import type { AgentRunEvent } from "../../contracts/events.js";
import {
  agentFlowActivityIdsForLive,
  deriveExecutionEdges,
  focusNodeIdSet,
  resolveCurrentTaskId,
} from "./edges.js";
import { rebuildExecutionOverlay } from "./overlay.js";

const FILE_INDEX = [
  { path: "lib/auth.ts", nodeIds: ["code_auth"] },
  { path: "app/login/page.tsx", nodeIds: ["code_login"] },
];

function event(
  partial: Partial<AgentRunEvent> &
    Pick<AgentRunEvent, "type" | "eventId" | "timestamp"> & {
      payload?: unknown;
      phaseId?: string;
    },
): AgentRunEvent {
  return { runId: "run_1", ...partial } as AgentRunEvent;
}

describe("deriveExecutionEdges", () => {
  it("draws read_context from read nodes to edit nodes with evidence", () => {
    const overlay = rebuildExecutionOverlay(
      [
        event({
          type: "file_read",
          eventId: "r1",
          phaseId: "phase_gen",
          timestamp: "2026-10-20T01:00:00.000Z",
          payload: { path: "lib/auth.ts", byteLength: 1, status: "ok" },
        }),
        event({
          type: "diff_proposed",
          eventId: "d1",
          phaseId: "phase_gen",
          timestamp: "2026-10-20T01:00:01.000Z",
          payload: {
            files: [{ path: "app/login/page.tsx", operation: "modify" }],
          },
        }),
      ],
      FILE_INDEX,
    )!;

    const edges = deriveExecutionEdges(overlay, { currentTaskOnly: true });
    expect(edges.some((edge) => edge.kind === "read_context")).toBe(true);
    const readEdge = edges.find((edge) => edge.kind === "read_context")!;
    expect(readEdge.sourceNodeId).toBe("code_auth");
    expect(readEdge.targetNodeId).toBe("code_login");
    expect(readEdge.inferred).toBe(false);
    expect(readEdge.sourceActivityIds.length).toBeGreaterThan(0);
  });

  it("filters to focus task and marks impact as inferred", () => {
    const overlay = rebuildExecutionOverlay(
      [
        event({
          type: "file_read",
          eventId: "r1",
          phaseId: "phase_a",
          timestamp: "2026-10-20T01:00:00.000Z",
          payload: { path: "lib/auth.ts", byteLength: 1, status: "ok" },
        }),
        event({
          type: "diff_proposed",
          eventId: "d1",
          phaseId: "phase_a",
          timestamp: "2026-10-20T01:00:01.000Z",
          payload: {
            files: [{ path: "app/login/page.tsx", operation: "modify" }],
          },
        }),
        event({
          type: "file_read",
          eventId: "r2",
          phaseId: "phase_b",
          timestamp: "2026-10-20T01:00:02.000Z",
          payload: { path: "lib/auth.ts", byteLength: 1, status: "ok" },
        }),
      ],
      FILE_INDEX,
    )!;

    // phase_a still has a running edit; current task prefers running over latest complete.
    expect(resolveCurrentTaskId(overlay)).toBe("phase_a");
    const focused = deriveExecutionEdges(overlay, { focusTaskId: "phase_a" });
    expect(
      focused.every((edge) => !edge.taskId || edge.taskId === "phase_a"),
    ).toBe(true);
    expect(focused.some((edge) => edge.kind === "read_context")).toBe(true);
    const onlyB = deriveExecutionEdges(overlay, { focusTaskId: "phase_b" });
    expect(onlyB.some((edge) => edge.kind === "read_context")).toBe(false);

    const withImpact = deriveExecutionEdges(overlay, {
      focusTaskId: "phase_a",
      resolveImpactDependents: (nodeId) =>
        nodeId === "code_login" ? ["feat_session"] : [],
    });
    const impact = withImpact.find((edge) => edge.kind === "impact");
    expect(impact?.inferred).toBe(true);
    expect(impact?.label).toContain("inferred");
    expect(focusNodeIdSet(overlay, "phase_a").has("code_login")).toBe(true);
  });
});

describe("agentFlowActivityIdsForLive", () => {
  it("aligns edit activities with Agent Flow id shape", () => {
    const ids = agentFlowActivityIdsForLive({
      id: "live:run:editing:app/login/page.tsx",
      runId: "run_1",
      kind: "editing",
      status: "complete",
      path: "app/login/page.tsx",
      nodeIds: ["code_login"],
      label: "page.tsx",
      startedAt: "2026-10-20T01:00:00.000Z",
      sourceEventIds: ["evt_diff"],
    });
    expect(ids).toContain("evt_diff");
    expect(ids).toContain("evt_diff:app/login/page.tsx");
  });
});

describe("delegation edges", () => {
  it("draws delegation edges from recorded parent→child links", () => {
    const overlay = rebuildExecutionOverlay(
      [
        event({
          type: "file_read",
          eventId: "r1",
          phaseId: "task_1",
          timestamp: "2026-10-20T01:00:00.000Z",
          payload: { path: "lib/auth.ts", byteLength: 1, status: "ok" },
        }),
        {
          eventId: "d1",
          runId: "run_1",
          timestamp: "2026-10-20T01:00:01.000Z",
          type: "task_delegated",
          payload: {
            planId: "plan_1",
            taskId: "task_1",
            childRunId: "run_child",
            targetKind: "leaf-file",
            nodeId: "code_login",
            filePath: "app/login/page.tsx",
          },
        } as AgentRunEvent,
      ],
      FILE_INDEX,
    )!;

    const edges = deriveExecutionEdges(overlay, { currentTaskOnly: false });
    const delegation = edges.find((edge) => edge.kind === "delegation");
    expect(delegation).toBeTruthy();
    expect(delegation?.sourceNodeId).toBe("code_auth");
    expect(delegation?.targetNodeId).toBe("code_login");
    expect(delegation?.inferred).toBe(false);
    expect(delegation?.label).toBe("delegates");
  });
});
