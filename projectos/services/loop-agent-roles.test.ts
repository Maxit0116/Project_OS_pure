import { describe, expect, it } from "vitest";

import {
  buildChangeSetFromRun,
  buildCoderGoal,
  buildHeuristicDevPlan,
  buildHeuristicReviewResult,
} from "./loop-agent-roles.js";
import type { LoopInstance } from "../contracts/loop-graph.js";

function emptyInstance(overrides: Partial<LoopInstance> = {}): LoopInstance {
  return {
    id: "inst_1",
    specVersion: "spec_1",
    status: "running",
    cursorNodeId: "n1",
    round: 0,
    attemptCounts: {},
    events: [],
    startedAt: "2026-11-03T00:00:00.000Z",
    updatedAt: "2026-11-03T00:00:00.000Z",
    ...overrides,
  };
}

describe("loop-agent-roles", () => {
  it("builds a structured DevPlan with dependent tasks", () => {
    const plan = buildHeuristicDevPlan({
      goal: "Add Feature Tree linking Issues to Branches and PRs",
      constraints: ["Preserve graph interactions"],
    });
    expect(plan.tasks.length).toBeGreaterThanOrEqual(2);
    expect(plan.tasks[0]?.depends_on).toEqual([]);
    expect(plan.tasks.some((task) => task.depends_on.length > 0)).toBe(true);
  });

  it("binds Coder goal to the next DevPlan task", () => {
    const plan = buildHeuristicDevPlan({ goal: "Ship login" });
    const instance = emptyInstance({
      artifacts: [
        {
          id: "art_plan",
          nodeId: "n_planner",
          kind: "dev_plan",
          createdAt: "2026-11-03T00:00:00.000Z",
          data: plan,
        },
      ],
    });
    const bound = buildCoderGoal({
      node: {
        id: "n_coder",
        role: "implement",
        type: "agent",
        agentRole: "coder",
        goal: "Implement assigned task",
        constraints: [],
        inputs: [],
        outputs: [],
        acceptance: [],
      },
      instance,
      specGoal: "Ship login",
    });
    expect(bound.task?.id).toBe("T1");
    expect(bound.goal).toContain("Task T1:");
    expect(bound.goal).toContain("DevPlan goal:");
  });

  it("emits ChangeSet from a completed run", () => {
    const changeSet = buildChangeSetFromRun({
      filePath: "src/feature-tree.tsx",
      goal: "Build UI",
      agentRunId: "run_9",
      task: {
        id: "T2",
        title: "Build UI",
        type: "frontend",
        depends_on: ["T1"],
      },
    });
    expect(changeSet.files).toEqual(["src/feature-tree.tsx"]);
    expect(changeSet.summary).toContain("T2");
    expect(changeSet.agentRunId).toBe("run_9");
  });

  it("reviews artifacts into pass / needs_changes / blocked", () => {
    expect(buildHeuristicReviewResult(emptyInstance()).verdict).toBe("blocked");

    const withChangeSet = emptyInstance({
      artifacts: [
        {
          id: "a1",
          nodeId: "coder",
          kind: "change_set",
          createdAt: "2026-11-03T00:00:00.000Z",
          data: {
            files: ["a.ts"],
            summary: "done",
            agentRunId: "run_1",
          },
        },
      ],
    });
    expect(buildHeuristicReviewResult(withChangeSet).verdict).toBe("pass");

    const failedTests = emptyInstance({
      artifacts: [
        ...(withChangeSet.artifacts ?? []),
        {
          id: "a2",
          nodeId: "test",
          kind: "test_report",
          createdAt: "2026-11-03T00:00:01.000Z",
          data: { status: "failed", failed: 2 },
        },
      ],
    });
    expect(buildHeuristicReviewResult(failedTests).verdict).toBe("needs_changes");
  });
});
