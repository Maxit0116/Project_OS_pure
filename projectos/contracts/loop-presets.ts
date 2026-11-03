import { z } from "zod";

import {
  IntentGraphSchema,
  type IntentGraph,
  type IntentGraphNode,
} from "./loop-graph.js";
import type {
  LoopActionIntegration,
  LoopAgentRole,
  LoopHumanMode,
  LoopLogicKind,
  LoopNodeType,
} from "./loop-node-architecture.js";

export const LoopPaletteCategorySchema = z.enum([
  "agent",
  "action",
  "logic",
  "human",
]);

export const LoopPaletteItemSchema = z
  .object({
    id: z.string().min(1),
    category: LoopPaletteCategorySchema,
    title: z.string().trim().min(1).max(80),
    description: z.string().trim().min(1).max(240),
    /** Seed fields applied when dropping onto the canvas. */
    seed: z
      .object({
        title: z.string().trim().min(1).max(120),
        prompt: z.string().trim().max(4000),
        type: z.enum(["agent", "action", "logic", "human"]),
        agentRole: z
          .enum([
            "planner",
            "coder",
            "reviewer",
            "researcher",
            "tester",
            "debugger",
            "architect",
            "documenter",
          ])
          .optional(),
        humanMode: z
          .enum(["approval", "review", "input", "decision", "takeover"])
          .optional(),
        actionIntegration: z.enum(["github", "test", "terminal"]).optional(),
        actionOperation: z.string().trim().min(1).max(80).optional(),
        logicKind: z
          .enum(["condition", "loop", "merge", "exit", "retry", "wait"])
          .optional(),
        maxIterations: z.number().int().positive().max(50).optional(),
        repairMode: z.boolean().optional(),
      })
      .strict(),
  })
  .strict();

export const LoopGraphPresetSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().trim().min(1).max(120),
    description: z.string().trim().min(1).max(500),
    draft: IntentGraphSchema,
  })
  .strict();

export type LoopPaletteCategory = z.infer<typeof LoopPaletteCategorySchema>;
export type LoopPaletteItem = z.infer<typeof LoopPaletteItemSchema>;
export type LoopGraphPreset = z.infer<typeof LoopGraphPresetSchema>;

type Seed = LoopPaletteItem["seed"];

function seedNode(
  id: string,
  seed: Seed,
  position: { x: number; y: number },
): IntentGraphNode {
  return {
    id,
    title: seed.title,
    prompt: seed.prompt,
    position,
    type: seed.type as LoopNodeType,
    ...(seed.agentRole ? { agentRole: seed.agentRole as LoopAgentRole } : {}),
    ...(seed.humanMode ? { humanMode: seed.humanMode as LoopHumanMode } : {}),
    ...(seed.actionIntegration
      ? { actionIntegration: seed.actionIntegration as LoopActionIntegration }
      : {}),
    ...(seed.actionOperation ? { actionOperation: seed.actionOperation } : {}),
    ...(seed.logicKind ? { logicKind: seed.logicKind as LoopLogicKind } : {}),
    ...(typeof seed.maxIterations === "number"
      ? { maxIterations: seed.maxIterations }
      : {}),
    ...(seed.repairMode ? { repairMode: true } : {}),
  };
}

export const LOOP_PALETTE_ITEMS: LoopPaletteItem[] = [
  {
    id: "agent.planner",
    category: "agent",
    title: "Planner",
    description: "Turn a goal into a structured DevPlan",
    seed: {
      title: "Planner",
      prompt: "Analyze the goal and project context, then produce a structured DevPlan.",
      type: "agent",
      agentRole: "planner",
    },
  },
  {
    id: "agent.coder",
    category: "agent",
    title: "Coder",
    description: "Implement a task and emit a ChangeSet",
    seed: {
      title: "Coder",
      prompt: "Implement the assigned task within the allowed write scope.",
      type: "agent",
      agentRole: "coder",
    },
  },
  {
    id: "agent.reviewer",
    category: "agent",
    title: "Reviewer",
    description: "Review changes against requirements",
    seed: {
      title: "Reviewer",
      prompt: "Review the ChangeSet and tests; emit pass, needs_changes, or blocked.",
      type: "agent",
      agentRole: "reviewer",
    },
  },
  {
    id: "action.test",
    category: "action",
    title: "Run Tests",
    description: "Run a configurable test command",
    seed: {
      title: "Run Tests",
      prompt: "Execute the project test command and produce a TestReport.",
      type: "action",
      actionIntegration: "test",
      actionOperation: "run",
    },
  },
  {
    id: "action.github.create_pr",
    category: "action",
    title: "Create PR",
    description: "Create a GitHub pull request (requires approval)",
    seed: {
      title: "Create PR",
      prompt: "Create a pull request with the approved title, body, and base branch.",
      type: "action",
      actionIntegration: "github",
      actionOperation: "create_pr",
    },
  },
  {
    id: "action.github.create_branch",
    category: "action",
    title: "Create Branch",
    description: "Create a Git branch",
    seed: {
      title: "Create Branch",
      prompt: "Create a feature branch from the approved base ref.",
      type: "action",
      actionIntegration: "github",
      actionOperation: "create_branch",
    },
  },
  {
    id: "action.terminal",
    category: "action",
    title: "Terminal",
    description: "Run a sandboxed shell command",
    seed: {
      title: "Terminal",
      prompt: "Execute the configured shell command under harness policy.",
      type: "action",
      actionIntegration: "terminal",
      actionOperation: "exec",
    },
  },
  {
    id: "logic.condition",
    category: "logic",
    title: "Condition",
    description: "Branch on upstream artifact fields",
    seed: {
      title: "Condition",
      prompt: "Branch on test_report.status == passed.",
      type: "logic",
      logicKind: "condition",
    },
  },
  {
    id: "logic.loop",
    category: "logic",
    title: "Loop",
    description: "Bounded retry loop",
    seed: {
      title: "Loop",
      prompt: "Retry until exit condition or maxIterations.",
      type: "logic",
      logicKind: "loop",
      maxIterations: 3,
    },
  },
  {
    id: "logic.merge",
    category: "logic",
    title: "Merge",
    description: "Wait for all inbound branches",
    seed: {
      title: "Merge",
      prompt: "Wait for all inbound branches to succeed, then continue.",
      type: "logic",
      logicKind: "merge",
    },
  },
  {
    id: "logic.exit",
    category: "logic",
    title: "Exit",
    description: "End the workflow and summarize artifacts",
    seed: {
      title: "Exit",
      prompt: "Complete the workflow and return collected artifacts.",
      type: "logic",
      logicKind: "exit",
    },
  },
  {
    id: "human.approval",
    category: "human",
    title: "Approval",
    description: "Approve, reject, or edit a risky action",
    seed: {
      title: "Approval",
      prompt: "Human must approve the next side-effecting action.",
      type: "human",
      humanMode: "approval",
    },
  },
  {
    id: "human.review",
    category: "human",
    title: "Review",
    description: "Review a DevPlan, Diff, or report",
    seed: {
      title: "Human Review",
      prompt: "Review the artifact and Accept, Request Changes, or Reject.",
      type: "human",
      humanMode: "review",
    },
  },
  {
    id: "human.input",
    category: "human",
    title: "Input",
    description: "Ask the human for missing information",
    seed: {
      title: "Human Input",
      prompt: "Collect the missing parameters needed to continue.",
      type: "human",
      humanMode: "input",
    },
  },
].map((item) => LoopPaletteItemSchema.parse(item));

function paletteSeed(id: string): Seed {
  const item = LOOP_PALETTE_ITEMS.find((entry) => entry.id === id);
  if (!item) throw new Error(`Missing palette item ${id}`);
  return item.seed;
}

function featureDevelopmentDraft(): IntentGraph {
  const nodes: IntentGraphNode[] = [
    seedNode("n_planner", paletteSeed("agent.planner"), { x: 40, y: 40 }),
    seedNode("n_plan_review", paletteSeed("human.review"), { x: 40, y: 140 }),
    seedNode("n_coder", paletteSeed("agent.coder"), { x: 40, y: 240 }),
    seedNode("n_test", paletteSeed("action.test"), { x: 40, y: 340 }),
    seedNode("n_condition", paletteSeed("logic.condition"), { x: 40, y: 440 }),
    seedNode("n_reviewer", paletteSeed("agent.reviewer"), { x: 280, y: 440 }),
    seedNode("n_approval", paletteSeed("human.approval"), { x: 280, y: 540 }),
    seedNode("n_create_pr", paletteSeed("action.github.create_pr"), {
      x: 280,
      y: 640,
    }),
  ];

  return IntentGraphSchema.parse({
    revision: 1,
    graphPrompt:
      "Feature development: plan → human review → code → test → branch → review → approve PR.",
    nodes,
    edges: [
      {
        id: "e1",
        source: "n_planner",
        target: "n_plan_review",
        kind: "depends",
        prompt: "Hand DevPlan to human review",
      },
      {
        id: "e2",
        source: "n_plan_review",
        target: "n_coder",
        kind: "depends",
        prompt: "On accept, implement first task",
      },
      {
        id: "e3",
        source: "n_coder",
        target: "n_test",
        kind: "depends",
        prompt: "Run tests after implementation",
      },
      {
        id: "e4",
        source: "n_test",
        target: "n_condition",
        kind: "depends",
        prompt: "Branch on TestReport.status",
      },
      {
        id: "e5",
        source: "n_condition",
        target: "n_reviewer",
        kind: "conditional",
        branchKey: "pass",
        prompt: "Tests passed → AI review",
      },
      {
        id: "e6",
        source: "n_condition",
        target: "n_coder",
        kind: "conditional",
        branchKey: "fail",
        prompt: "Tests failed → return errors to Coder",
      },
      {
        id: "e7",
        source: "n_reviewer",
        target: "n_approval",
        kind: "depends",
        prompt: "On review pass, request final approval",
      },
      {
        id: "e8",
        source: "n_approval",
        target: "n_create_pr",
        kind: "depends",
        prompt: "Execute approved Create PR parameters",
      },
    ],
  });
}

export const LOOP_GRAPH_PRESETS: LoopGraphPreset[] = [
  LoopGraphPresetSchema.parse({
    id: "feature_development",
    title: "Feature Development",
    description:
      "Planner → Human Review → Coder → Tests → Condition → Reviewer → Approval → Create PR",
    draft: featureDevelopmentDraft(),
  }),
];

export function getLoopPaletteItem(id: string): LoopPaletteItem | undefined {
  return LOOP_PALETTE_ITEMS.find((item) => item.id === id);
}

export function getLoopGraphPreset(id: string): LoopGraphPreset | undefined {
  return LOOP_GRAPH_PRESETS.find((preset) => preset.id === id);
}

export function createNodeFromPaletteItem(
  item: LoopPaletteItem,
  input: { id: string; position: { x: number; y: number } },
): IntentGraphNode {
  return seedNode(input.id, item.seed, input.position);
}
