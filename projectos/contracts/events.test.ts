import { describe, expect, it } from "vitest";

import {
  AgentActionEventSchema,
  AgentDelegationEventSchema,
  AgentRunEventSchema,
  AgentTransientTraceSchema,
} from "./events.js";

const identity = {
  eventId: "evt_trace",
  runId: "run_trace",
  timestamp: "2026-07-18T00:00:00.000Z",
};

describe("agent action event contracts", () => {
  it("accepts the server-defined truthful live Change phases", () => {
    for (const kind of [
      "context_prepared",
      "locate_plan",
      "generate_proposal",
      "validate_proposal",
      "apply_change",
      "verify_change",
      "plan_delegation",
      "delegate_tasks",
    ] as const) {
      expect(AgentRunEventSchema.safeParse({
        ...identity,
        type: "step_started",
        step: {
          id: `step_${kind}`,
          label: kind,
          kind,
          status: "running",
          relatedNodeIds: ["node_login"],
          relatedFiles: ["app/login/page.tsx"],
        },
      }).success).toBe(true);
    }
  });

  it("parses strict durable delegation lifecycle events", () => {
    const event = AgentDelegationEventSchema.parse({
      ...identity,
      type: "task_delegated",
      payload: {
        planId: "plan_login",
        taskId: "task_1",
        childRunId: "run_child",
        nodeId: "node_login",
        filePath: "app/login/page.tsx",
      },
    });

    expect(AgentRunEventSchema.safeParse(event).success).toBe(true);
    expect(AgentDelegationEventSchema.safeParse({
      ...event,
      payload: { ...event.payload, allowedWritePaths: ["lib/other.ts"] },
    }).success).toBe(false);
  });

  it("retains a bounded failure category for failed child-run audit events", () => {
    expect(AgentDelegationEventSchema.parse({
      ...identity,
      type: "child_run_completed",
      payload: {
        planId: "plan_login",
        taskId: "task_1",
        childRunId: "run_child",
        status: "error",
        failureCategory: "search_ambiguous",
      },
    }).payload).toMatchObject({ failureCategory: "search_ambiguous" });
    expect(AgentDelegationEventSchema.safeParse({
      ...identity,
      type: "child_run_completed",
      payload: {
        planId: "plan_login",
        taskId: "task_1",
        childRunId: "run_child",
        status: "error",
        failureCategory: "secret/path",
      },
    }).success).toBe(false);
  });

  it("represents planner and leaf delegation targets without granting write scope", () => {
    const planner = AgentDelegationEventSchema.parse({
      ...identity,
      type: "task_delegated",
      payload: {
        planId: "plan_global",
        taskId: "task_context",
        childRunId: "run_context",
        targetKind: "planner",
        nodeId: "system_product",
        level: "context",
      },
    });
    const leaf = AgentDelegationEventSchema.parse({
      ...identity,
      type: "task_delegated",
      payload: {
        planId: "plan_component",
        taskId: "task_file",
        childRunId: "run_leaf",
        targetKind: "leaf-file",
        nodeId: "component_login",
        filePath: "app/login/page.tsx",
      },
    });
    expect(AgentRunEventSchema.safeParse(planner).success).toBe(true);
    expect(AgentRunEventSchema.safeParse(leaf).success).toBe(true);
    expect(AgentDelegationEventSchema.safeParse({
      ...planner,
      payload: { ...planner.payload, filePath: "src/not-authorized.ts" },
    }).success).toBe(false);
  });

  it("parses typed metadata-only actions", () => {
    const event = AgentActionEventSchema.parse({
      ...identity,
      type: "context_assembled",
      payload: {
        files: [{
          path: "app/login/page.tsx",
          disposition: "exact",
          byteLength: 120,
          includedByteLength: 120,
        }],
        synopsisPresent: true,
        childrenCoverage: {
          totalCount: 2,
          includedCount: 2,
          omittedCount: 0,
        },
        bundleHash: `sha256:${"a".repeat(64)}`,
      },
    });

    expect(event.type).toBe("context_assembled");
    expect(AgentRunEventSchema.safeParse(event).success).toBe(true);
  });

  it("parses tool_policy_decision and mcp_tool_call action events", () => {
    const policy = AgentActionEventSchema.parse({
      ...identity,
      type: "tool_policy_decision",
      payload: {
        tool: "mcp_tool",
        decision: "deny",
        reason: "No allow rule matched",
        match: "mcp:demo:lookup",
      },
    });
    expect(policy.type).toBe("tool_policy_decision");
    expect(AgentRunEventSchema.safeParse(policy).success).toBe(true);

    const mcp = AgentActionEventSchema.parse({
      ...identity,
      type: "mcp_tool_call",
      payload: {
        serverId: "demo",
        toolName: "lookup",
        callId: "call-1",
        status: "rejected",
        durationMs: 12,
        error: "tool_policy_deny",
      },
    });
    expect(mcp.type).toBe("mcp_tool_call");
    expect(AgentRunEventSchema.safeParse(mcp).success).toBe(true);
  });

  it("binds a metadata-only edit plan to its phase", () => {
    const event = AgentActionEventSchema.parse({
      ...identity,
      phaseId: "step_locate",
      type: "edit_plan_created",
      payload: {
        path: "app/login/page.tsx",
        objective: "Update the login behavior",
        anchors: ["login form submit handler"],
        acceptanceCriteria: ["The requested behavior is visible"],
        rationale: "The selected file owns the interaction.",
        changeRequired: true,
      },
    });

    expect(event.phaseId).toBe("step_locate");
    expect(AgentRunEventSchema.safeParse(event).success).toBe(true);
    expect(AgentActionEventSchema.safeParse({
      ...event,
      payload: { ...event.payload, replacement: "source must not be persisted" },
    }).success).toBe(false);
  });

  it("keeps provider reasoning in a distinct transient trace contract", () => {
    const trace = AgentTransientTraceSchema.parse({
      traceId: "trace_reasoning",
      runId: identity.runId,
      timestamp: identity.timestamp,
      type: "provider_reasoning",
      phaseId: "step_locate",
      content: "Redacted provider-supplied trace",
      source: "provider_supplied",
      truncated: false,
    });

    expect(trace.phaseId).toBe("step_locate");
    expect(AgentRunEventSchema.safeParse(trace).success).toBe(false);
  });

  it("accepts only a bounded validation projection in durable events", () => {
    const event = AgentActionEventSchema.parse({
      ...identity,
      phaseId: "step_validate",
      type: "proposal_validation_result",
      payload: {
        path: "app/login/page.tsx",
        verdict: "valid",
        criteria: [{ criterion: "Login works", status: "satisfied" }],
        scopeStatus: "compliant",
        summary: "The proposal meets the plan.",
        rationale: "The exact scoped edit satisfies the criterion.",
      },
    });

    expect(event.type).toBe("proposal_validation_result");
    expect(AgentActionEventSchema.safeParse({
      ...event,
      payload: { ...event.payload, modifiedDiff: { after: "source" } },
    }).success).toBe(false);
  });

  it("keeps batch validation events metadata-only and bounded", () => {
    const event = AgentActionEventSchema.parse({
      ...identity,
      phaseId: "step_validate_batch",
      type: "batch_validation_result",
      payload: {
        planId: "plan_one",
        verdict: "valid",
        tasks: [{
          taskId: "task_1",
          childRunId: "run_child",
          path: "src/a.ts",
          status: "consistent",
          criteria: [{ criterion: "Exports stay compatible", status: "satisfied" }],
        }],
        crossFileStatus: "consistent",
        summary: "The batch is valid.",
        rationale: "All delegated criteria were checked.",
      },
    });

    expect(AgentRunEventSchema.safeParse(event).success).toBe(true);
    expect(AgentActionEventSchema.safeParse({
      ...event,
      payload: { ...event.payload, proposal: { after: "source" } },
    }).success).toBe(false);
  });

  it("keeps persisted pre-hierarchy context events readable", () => {
    expect(AgentActionEventSchema.safeParse({
      ...identity,
      type: "context_assembled",
      payload: {
        files: [],
        synopsisPresent: true,
        bundleHash: `sha256:${"a".repeat(64)}`,
      },
    }).success).toBe(true);
  });

  it("rejects source content and untyped fields in action payloads", () => {
    expect(AgentActionEventSchema.safeParse({
      ...identity,
      type: "file_read",
      payload: {
        path: "app/login/page.tsx",
        byteLength: 120,
        status: "ok",
        content: "export default function Secret() {}",
      },
    }).success).toBe(false);
    expect(AgentActionEventSchema.safeParse({
      ...identity,
      type: "diff_proposed",
      payload: {
        files: [{
          path: "app/login/page.tsx",
          operation: "modify",
          after: "source content must not be observable",
        }],
      },
    }).success).toBe(false);
  });
});
