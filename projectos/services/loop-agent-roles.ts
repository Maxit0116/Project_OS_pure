import {
  LoopChangeSetSchema,
  LoopDevPlanSchema,
  LoopReviewResultSchema,
  type LoopChangeSet,
  type LoopDevPlan,
  type LoopDevPlanTask,
  type LoopReviewResult,
} from "../contracts/loop-artifacts.js";
import type { LoopInstance, LoopSpecNode } from "../contracts/loop-graph.js";
import { latestArtifact } from "./loop-runtime-architecture.js";

function inferTaskType(text: string): LoopDevPlanTask["type"] {
  const lower = text.toLowerCase();
  if (/test|spec|vitest|jest|e2e|验收/.test(lower)) return "testing";
  if (/ui|frontend|react|tsx|css|页面|组件/.test(lower)) return "frontend";
  if (/db|database|schema|sql|prisma|数据/.test(lower)) return "database";
  if (/deploy|ci|infra|docker|k8s/.test(lower)) return "infra";
  if (/doc|readme|注释/.test(lower)) return "docs";
  if (/api|backend|server|service|后端/.test(lower)) return "backend";
  return "other";
}

/**
 * MVP Planner: deterministic structured DevPlan (no model required).
 * Downstream Coder binds tasks[i] instead of parsing Markdown.
 */
export function buildHeuristicDevPlan(input: {
  goal: string;
  nodeGoal?: string;
  constraints?: string[];
}): LoopDevPlan {
  const goal = (input.goal.trim() || input.nodeGoal?.trim() || "Complete the engineering goal").slice(
    0,
    1000,
  );
  const constraints = (input.constraints ?? []).filter(Boolean).slice(0, 20);
  const seed = `${goal}\n${input.nodeGoal ?? ""}`;

  const tasks: LoopDevPlanTask[] = [
    {
      id: "T1",
      title: "Analyze scope and update data/contracts if needed",
      type: inferTaskType(`backend ${seed}`),
      depends_on: [],
      ...(constraints.length ? { constraints } : {}),
    },
    {
      id: "T2",
      title: "Implement primary user-facing or API changes",
      type: inferTaskType(`frontend ${seed}`),
      depends_on: ["T1"],
      ...(constraints.length ? { constraints } : {}),
    },
    {
      id: "T3",
      title: "Add or update verification coverage",
      type: "testing",
      depends_on: ["T1", "T2"],
      ...(constraints.length ? { constraints } : {}),
    },
  ];

  // If the goal clearly names one area, keep a tighter plan.
  if (/^fix\b|bug|hotfix/i.test(goal)) {
    return LoopDevPlanSchema.parse({
      goal,
      tasks: [
        {
          id: "T1",
          title: goal.slice(0, 240),
          type: inferTaskType(goal),
          depends_on: [],
          ...(constraints.length ? { constraints } : {}),
        },
        {
          id: "T2",
          title: "Verify the fix with tests",
          type: "testing",
          depends_on: ["T1"],
        },
      ],
      risks: ["Regression in adjacent modules"],
      expectedArtifacts: ["ChangeSet", "TestReport"],
    });
  }

  return LoopDevPlanSchema.parse({
    goal,
    tasks,
    risks: ["Scope creep", "Write-scope conflicts across parallel work"],
    expectedArtifacts: ["ChangeSet", "TestReport", "ReviewResult"],
  });
}

export function readDevPlan(instance: LoopInstance): LoopDevPlan | null {
  const artifact = latestArtifact(instance, "dev_plan");
  if (!artifact) return null;
  const parsed = LoopDevPlanSchema.safeParse(artifact.data);
  return parsed.success ? parsed.data : null;
}

export function pickNextDevPlanTask(
  plan: LoopDevPlan,
  attemptCounts: Record<string, number>,
): LoopDevPlanTask {
  // Prefer the first task whose attempt count is still zero; otherwise first task.
  const fresh = plan.tasks.find((task) => (attemptCounts[task.id] ?? 0) === 0);
  return fresh ?? plan.tasks[0]!;
}

export function buildCoderGoal(input: {
  node: LoopSpecNode;
  instance: LoopInstance;
  specGoal: string;
}): { goal: string; task: LoopDevPlanTask | null; plan: LoopDevPlan | null } {
  const plan = readDevPlan(input.instance);
  if (!plan) {
    return {
      goal: input.node.goal.slice(0, 1000),
      task: null,
      plan: null,
    };
  }
  const task = pickNextDevPlanTask(plan, input.instance.attemptCounts);
  const parts = [
    `DevPlan goal: ${plan.goal}`,
    `Task ${task.id}: ${task.title}`,
    `Task type: ${task.type}`,
    task.constraints?.length ? `Constraints: ${task.constraints.join("; ")}` : "",
    task.writeScope?.length ? `Write scope: ${task.writeScope.join(", ")}` : "",
    `Node goal: ${input.node.goal}`,
    `Workflow goal: ${input.specGoal}`,
  ].filter(Boolean);
  return {
    goal: parts.join("\n").slice(0, 1000),
    task,
    plan,
  };
}

export function buildChangeSetFromRun(input: {
  filePath: string;
  goal: string;
  agentRunId: string;
  task?: LoopDevPlanTask | null;
  /** Extra delivery paths (writeScope / prior leaves) beyond the primary leaf. */
  additionalFiles?: string[];
  deletedFiles?: string[];
  contentDigest?: string;
  fileDigests?: Record<string, string>;
}): LoopChangeSet {
  const files = [
    ...new Set(
      [input.filePath, ...(input.additionalFiles ?? []), ...(input.task?.writeScope ?? [])]
        .map((path) => path.trim())
        .filter(Boolean),
    ),
  ].slice(0, 200);
  return LoopChangeSetSchema.parse({
    files,
    ...(input.deletedFiles?.length
      ? { deletedFiles: [...new Set(input.deletedFiles)].slice(0, 200) }
      : {}),
    summary: input.task
      ? `Completed ${input.task.id}: ${input.task.title}`
      : input.goal.slice(0, 500),
    unfinished: [],
    problems: [],
    agentRunId: input.agentRunId,
    ...(input.contentDigest ? { contentDigest: input.contentDigest } : {}),
    ...(input.fileDigests ? { fileDigests: input.fileDigests } : {}),
  });
}

export function buildHeuristicReviewResult(instance: LoopInstance): LoopReviewResult {
  const changeSetArt = latestArtifact(instance, "change_set");
  const testArt = latestArtifact(instance, "test_report");
  const plan = readDevPlan(instance);

  if (!changeSetArt) {
    return LoopReviewResultSchema.parse({
      verdict: "blocked",
      allowNext: false,
      issues: [
        {
          id: "missing_changeset",
          severity: "critical",
          message: "No ChangeSet artifact found for review",
        },
      ],
      summary: "Blocked: missing implementation artifact",
    });
  }

  const changeSet = LoopChangeSetSchema.safeParse(changeSetArt.data);
  if (!changeSet.success) {
    return LoopReviewResultSchema.parse({
      verdict: "blocked",
      allowNext: false,
      issues: [
        {
          id: "invalid_changeset",
          severity: "critical",
          message: "ChangeSet artifact failed schema validation",
        },
      ],
      summary: "Blocked: invalid ChangeSet",
    });
  }

  const validatedCodeDigest = changeSet.data.contentDigest;

  if (testArt) {
    const status =
      typeof testArt.data === "object" &&
      testArt.data &&
      "status" in testArt.data
        ? String((testArt.data as { status?: string }).status)
        : "";
    if (status === "failed" || status === "error") {
      return LoopReviewResultSchema.parse({
        verdict: "needs_changes",
        allowNext: false,
        issues: [
          {
            id: "tests_failed",
            severity: "error",
            message: "Latest TestReport is not passing",
            suggestedFix: "Return to Coder with failing test context",
          },
        ],
        summary: "Needs changes: tests failed",
        ...(validatedCodeDigest ? { validatedCodeDigest } : {}),
      });
    }
    const testDigest =
      typeof testArt.data === "object" &&
      testArt.data &&
      "validatedCodeDigest" in testArt.data
        ? String(
            (testArt.data as { validatedCodeDigest?: string })
              .validatedCodeDigest ?? "",
          )
        : "";
    if (
      validatedCodeDigest &&
      testDigest &&
      testDigest !== validatedCodeDigest
    ) {
      return LoopReviewResultSchema.parse({
        verdict: "needs_changes",
        allowNext: false,
        issues: [
          {
            id: "stale_test_evidence",
            severity: "error",
            message:
              "TestReport validated a different code digest than the latest ChangeSet",
            suggestedFix: "Re-run tests against the current ChangeSet",
          },
        ],
        summary: "Needs changes: test evidence is stale vs ChangeSet",
        ...(validatedCodeDigest ? { validatedCodeDigest } : {}),
      });
    }
  }

  if (changeSet.data.problems && changeSet.data.problems.length > 0) {
    return LoopReviewResultSchema.parse({
      verdict: "needs_changes",
      allowNext: false,
      issues: changeSet.data.problems.map((problem, index) => ({
        id: `problem_${index + 1}`,
        severity: "warning" as const,
        message: problem,
      })),
      summary: "Needs changes: coder reported unfinished problems",
      ...(validatedCodeDigest ? { validatedCodeDigest } : {}),
    });
  }

  return LoopReviewResultSchema.parse({
    verdict: "pass",
    allowNext: true,
    issues: [],
    summary: plan
      ? `Pass: ChangeSet covers DevPlan "${plan.goal}"`
      : "Pass: ChangeSet present and no failing TestReport",
    ...(validatedCodeDigest ? { validatedCodeDigest } : {}),
  });
}

export function isPlannerAgent(node: LoopSpecNode): boolean {
  return node.type === "agent" && node.agentRole === "planner";
}

export function isReviewerAgent(node: LoopSpecNode): boolean {
  return node.type === "agent" && node.agentRole === "reviewer";
}

export function isCoderAgent(node: LoopSpecNode): boolean {
  if (node.type === "agent") {
    return !node.agentRole || node.agentRole === "coder";
  }
  return node.role === "implement" || node.role === "fix";
}
