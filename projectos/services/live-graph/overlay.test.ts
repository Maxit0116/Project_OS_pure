import { describe, expect, it } from "vitest";

import type { AgentRunEvent } from "../../contracts/events.js";
import {
  applyAgentRunEventToOverlay,
  emptyExecutionOverlay,
  listUnmappedActivities,
  rebuildExecutionOverlay,
  remapExecutionOverlay,
  summarizeNodeLiveActivity,
} from "./overlay.js";
import { resolvePathToNodeIds } from "./path-map.js";

const FILE_INDEX = [
  { path: "app/login/page.tsx", nodeIds: ["code_login", "feat_login"] },
  { path: "lib/auth.ts", nodeIds: ["code_auth"] },
];

function baseEvent(
  partial: Partial<AgentRunEvent> &
    Pick<AgentRunEvent, "type" | "eventId" | "timestamp"> & {
      payload?: unknown;
      phaseId?: string;
    },
): AgentRunEvent {
  return {
    runId: "run_1",
    ...partial,
  } as AgentRunEvent;
}

describe("resolvePathToNodeIds", () => {
  it("maps exact and suffix paths", () => {
    expect(resolvePathToNodeIds("app/login/page.tsx", FILE_INDEX)).toEqual([
      "code_login",
      "feat_login",
    ]);
    expect(
      resolvePathToNodeIds("/Users/me/proj/app/login/page.tsx", FILE_INDEX),
    ).toEqual(["code_login", "feat_login"]);
  });

  it("returns empty for unknown paths", () => {
    expect(resolvePathToNodeIds("scripts/seed.ts", FILE_INDEX)).toEqual([]);
  });
});

describe("applyAgentRunEventToOverlay", () => {
  it("dedupes by eventId", () => {
    const event = baseEvent({
      type: "file_read",
      eventId: "e1",
      timestamp: "2026-10-20T01:00:00.000Z",
      payload: { path: "lib/auth.ts", byteLength: 10, status: "ok" },
    });
    const once = applyAgentRunEventToOverlay(
      emptyExecutionOverlay("run_1"),
      event,
      FILE_INDEX,
    );
    const twice = applyAgentRunEventToOverlay(once, event, FILE_INDEX);
    expect(twice.seenEventIds).toEqual(["e1"]);
    expect(Object.keys(twice.activitiesById)).toHaveLength(1);
  });

  it("marks mapped reading and editing, and converges apply", () => {
    const events: AgentRunEvent[] = [
      baseEvent({
        type: "file_read",
        eventId: "r1",
        timestamp: "2026-10-20T01:00:00.000Z",
        payload: { path: "lib/auth.ts", byteLength: 10, status: "ok" },
      }),
      baseEvent({
        type: "diff_proposed",
        eventId: "d1",
        timestamp: "2026-10-20T01:00:01.000Z",
        payload: {
          files: [{ path: "app/login/page.tsx", operation: "modify" }],
        },
      }),
      baseEvent({
        type: "apply_result",
        eventId: "a1",
        timestamp: "2026-10-20T01:00:02.000Z",
        payload: {
          filesWritten: ["app/login/page.tsx"],
          outcome: "applied",
        },
      }),
    ];

    const overlay = rebuildExecutionOverlay(events, FILE_INDEX)!;
    const auth = summarizeNodeLiveActivity(overlay, "code_auth");
    expect(auth?.primaryKind).toBe("reading");
    expect(auth?.primaryStatus).toBe("complete");

    const login = summarizeNodeLiveActivity(overlay, "code_login");
    expect(login?.primaryKind).toBe("editing");
    expect(login?.primaryStatus).toBe("complete");
    expect(login?.activeCount).toBe(0);
  });

  it("keeps unmapped resources visible", () => {
    const overlay = applyAgentRunEventToOverlay(
      emptyExecutionOverlay("run_1"),
      baseEvent({
        type: "file_read",
        eventId: "u1",
        timestamp: "2026-10-20T01:00:00.000Z",
        payload: { path: "scripts/seed.ts", byteLength: 4, status: "ok" },
      }),
      FILE_INDEX,
    );
    const unmapped = listUnmappedActivities(overlay);
    expect(unmapped).toHaveLength(1);
    expect(unmapped[0]?.path).toBe("scripts/seed.ts");
    expect(unmapped[0]?.nodeIds).toEqual([]);
  });

  it("settles running activities when the run ends", () => {
    let overlay = applyAgentRunEventToOverlay(
      emptyExecutionOverlay("run_1"),
      baseEvent({
        type: "diff_proposed",
        eventId: "d1",
        timestamp: "2026-10-20T01:00:00.000Z",
        payload: {
          files: [{ path: "lib/auth.ts", operation: "modify" }],
        },
      }),
      FILE_INDEX,
    );
    expect(summarizeNodeLiveActivity(overlay, "code_auth")?.activeCount).toBe(1);

    overlay = applyAgentRunEventToOverlay(
      overlay,
      baseEvent({
        type: "run_cancelled",
        eventId: "c1",
        timestamp: "2026-10-20T01:00:05.000Z",
      }),
      FILE_INDEX,
    );
    const summary = summarizeNodeLiveActivity(overlay, "code_auth");
    expect(summary?.activeCount).toBe(0);
    expect(summary?.primaryStatus).toBe("error");
    expect(summary?.primaryKind).toBe("failed");
  });

  it("does not let a late started reopen a completed activity", () => {
    let overlay = applyAgentRunEventToOverlay(
      emptyExecutionOverlay("run_1"),
      baseEvent({
        type: "apply_result",
        eventId: "a1",
        timestamp: "2026-10-20T01:00:02.000Z",
        payload: {
          filesWritten: ["lib/auth.ts"],
          outcome: "applied",
        },
      }),
      FILE_INDEX,
    );
    overlay = applyAgentRunEventToOverlay(
      overlay,
      baseEvent({
        type: "diff_proposed",
        eventId: "d_late",
        timestamp: "2026-10-20T01:00:01.000Z",
        payload: {
          files: [{ path: "lib/auth.ts", operation: "modify" }],
        },
      }),
      FILE_INDEX,
    );
    const summary = summarizeNodeLiveActivity(overlay, "code_auth");
    expect(summary?.primaryStatus).toBe("complete");
    expect(summary?.activeCount).toBe(0);
  });

  it("shows multiple activities on one node without overwriting", () => {
    const events: AgentRunEvent[] = [
      baseEvent({
        type: "file_read",
        eventId: "r1",
        timestamp: "2026-10-20T01:00:00.000Z",
        payload: { path: "app/login/page.tsx", byteLength: 1, status: "ok" },
      }),
      baseEvent({
        type: "diff_proposed",
        eventId: "d1",
        timestamp: "2026-10-20T01:00:01.000Z",
        payload: {
          files: [{ path: "app/login/page.tsx", operation: "modify" }],
        },
      }),
    ];
    const overlay = rebuildExecutionOverlay(events, FILE_INDEX)!;
    const summary = summarizeNodeLiveActivity(overlay, "code_login");
    expect(summary?.totalCount).toBe(2);
    expect(summary?.activeCount).toBe(1);
    expect(summary?.primaryKind).toBe("editing");
  });

  it("keeps parallel agent activities on the same node with distinct agent labels", () => {
    let overlay = applyAgentRunEventToOverlay(
      emptyExecutionOverlay("run_parent"),
      baseEvent({
        runId: "run_parent",
        type: "file_read",
        eventId: "p_read",
        timestamp: "2026-10-20T01:00:00.000Z",
        payload: { path: "app/login/page.tsx", byteLength: 1, status: "ok" },
      }),
      FILE_INDEX,
    );
    overlay = applyAgentRunEventToOverlay(
      overlay,
      baseEvent({
        runId: "run_child",
        type: "diff_proposed",
        eventId: "c_diff",
        timestamp: "2026-10-20T01:00:01.000Z",
        payload: {
          files: [{ path: "app/login/page.tsx", operation: "modify" }],
        },
      }),
      FILE_INDEX,
    );

    expect(overlay.runId).toBe("run_parent");
    expect(overlay.runIds).toEqual(expect.arrayContaining(["run_parent", "run_child"]));
    const summary = summarizeNodeLiveActivity(overlay, "code_login");
    expect(summary?.totalCount).toBe(2);
    expect(summary?.activeCount).toBe(1);
    expect(summary?.agentLabels.length).toBeGreaterThanOrEqual(2);
    const activities = Object.values(overlay.activitiesById);
    expect(activities.some((item) => item.agentId === "A1")).toBe(true);
    expect(activities.some((item) => item.agentId === "A2")).toBe(true);
  });

  it("records task_delegated as waiting child activity and parent link", () => {
    let overlay = applyAgentRunEventToOverlay(
      emptyExecutionOverlay("run_parent"),
      baseEvent({
        runId: "run_parent",
        type: "file_read",
        eventId: "p_read",
        phaseId: "task_1",
        timestamp: "2026-10-20T01:00:00.000Z",
        payload: { path: "lib/auth.ts", byteLength: 1, status: "ok" },
      }),
      FILE_INDEX,
    );
    overlay = applyAgentRunEventToOverlay(
      overlay,
      {
        eventId: "deleg_1",
        runId: "run_parent",
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
      FILE_INDEX,
    );

    expect(overlay.childRunParentById.run_child).toBe("run_parent");
    expect(overlay.delegationLinks).toHaveLength(1);
    expect(overlay.delegationLinks[0]?.sourceNodeId).toBe("code_auth");
    expect(overlay.delegationLinks[0]?.targetNodeId).toBe("code_login");
    const login = summarizeNodeLiveActivity(overlay, "code_login");
    expect(login?.primaryKind).toBe("waiting");
    expect(login?.agentLabels).toContain("A2");
  });

  it("promotes unmapped paths when fileIndex gains a mapping", () => {
    let overlay = applyAgentRunEventToOverlay(
      emptyExecutionOverlay("run_1"),
      baseEvent({
        type: "file_read",
        eventId: "u1",
        timestamp: "2026-10-20T01:00:00.000Z",
        payload: { path: "scripts/seed.ts", byteLength: 4, status: "ok" },
      }),
      FILE_INDEX,
    );
    expect(listUnmappedActivities(overlay)).toHaveLength(1);

    overlay = remapExecutionOverlay(overlay, [
      ...FILE_INDEX,
      { path: "scripts/seed.ts", nodeIds: ["code_seed"] },
    ]);
    expect(listUnmappedActivities(overlay)).toHaveLength(0);
    expect(summarizeNodeLiveActivity(overlay, "code_seed")?.primaryKind).toBe(
      "reading",
    );
  });

  it("stores verification narrative from verification_result", () => {
    const overlay = applyAgentRunEventToOverlay(
      emptyExecutionOverlay("run_1"),
      baseEvent({
        type: "verification_result",
        eventId: "v1",
        timestamp: "2026-10-20T01:00:00.000Z",
        payload: {
          status: "failed",
          reason: "command_failed",
          evidenceId: "ev_1",
          command: "pnpm test",
          summary: "1 failed",
        },
      }),
      FILE_INDEX,
    );
    expect(overlay.verificationNarrative).toEqual(
      expect.objectContaining({
        runId: "run_1",
        status: "failed",
        reason: "command_failed",
        evidenceId: "ev_1",
        command: "pnpm test",
      }),
    );
  });

  it("settles only the child run when the child completes", () => {
    let overlay = applyAgentRunEventToOverlay(
      emptyExecutionOverlay("run_parent"),
      baseEvent({
        runId: "run_parent",
        type: "diff_proposed",
        eventId: "p_diff",
        timestamp: "2026-10-20T01:00:00.000Z",
        payload: {
          files: [{ path: "lib/auth.ts", operation: "modify" }],
        },
      }),
      FILE_INDEX,
    );
    overlay = applyAgentRunEventToOverlay(
      overlay,
      baseEvent({
        runId: "run_child",
        type: "diff_proposed",
        eventId: "c_diff",
        timestamp: "2026-10-20T01:00:01.000Z",
        payload: {
          files: [{ path: "app/login/page.tsx", operation: "modify" }],
        },
      }),
      FILE_INDEX,
    );
    overlay = applyAgentRunEventToOverlay(
      overlay,
      {
        eventId: "child_done",
        runId: "run_parent",
        timestamp: "2026-10-20T01:00:02.000Z",
        type: "child_run_completed",
        payload: {
          planId: "plan_1",
          taskId: "task_1",
          childRunId: "run_child",
          status: "complete",
        },
      } as AgentRunEvent,
      FILE_INDEX,
    );

    expect(summarizeNodeLiveActivity(overlay, "code_auth")?.activeCount).toBe(1);
    expect(summarizeNodeLiveActivity(overlay, "code_login")?.activeCount).toBe(0);
  });
});
