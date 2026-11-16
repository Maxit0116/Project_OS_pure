import { z } from "zod";

import {
  IntentGraphSchema,
  seedDutyItemsFromCapabilityPrompt,
  type IntentGraph,
  type IntentGraphNode,
  type LoopDutyItem,
} from "./loop-graph.js";
import type {
  LoopActionIntegration,
  LoopAgentRole,
  LoopHumanMode,
  LoopIntentNodeType,
  LoopLogicKind,
  LoopSatelliteKind,
} from "./loop-node-architecture.js";
import type { LoopConfigRef } from "./loop-graph.js";
import { LOOP_DEPARTMENT_TEMPLATES } from "./loop-departments.js";

export const LoopPaletteCategorySchema = z.enum([
  "agent",
  "action",
  "logic",
  "human",
  "config",
  "workgroup",
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
        type: z.enum(["agent", "action", "logic", "human", "config"]),
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
        actionIntegration: z
          .enum([
            "github",
            "test",
            "terminal",
            "slack",
            "feishu",
            "lark",
            "sentry",
            "notify",
            "lab",
            "gmail",
            "linear",
            "jira_cloud",
            "notion",
            "vercel",
            "supabase",
            "posthog",
          ])
          .optional(),
        actionOperation: z.string().trim().min(1).max(80).optional(),
        logicKind: z
          .enum([
            "condition",
            "loop",
            "merge",
            "exit",
            "retry",
            "wait",
            "schedule",
          ])
          .optional(),
        waitMs: z.number().int().nonnegative().max(604_800_000).optional(),
        scheduleMode: z.enum(["delay", "at"]).optional(),
        scheduleAt: z.string().trim().min(1).max(64).optional(),
        actionParams: z
          .record(
            z.string().min(1).max(80),
            z.union([z.string().max(2000), z.number().finite(), z.boolean()]),
          )
          .optional(),
        maxIterations: z.number().int().positive().max(50).optional(),
        repairMode: z.boolean().optional(),
        satelliteKind: z
          .enum(["model", "memory", "skill", "mcp", "rules", "pack"])
          .optional(),
        configRef: z
          .object({
            modelProfileId: z.string().min(1).max(120).optional(),
            skillId: z.string().min(1).max(120).optional(),
            mcpServerId: z.string().min(1).max(80).optional(),
            memoryMode: z.enum(["project", "buffer", "none"]).optional(),
            packId: z.string().min(1).max(120).optional(),
            rulesId: z.string().min(1).max(120).optional(),
          })
          .strict()
          .optional(),
        /** Optional explicit duty checklist; otherwise derived from prompt. */
        dutyItems: z
          .array(
            z
              .object({
                id: z.string().min(1),
                text: z.string().trim().min(1).max(240),
                kind: z.enum(["machine", "human"]),
                required: z.boolean().default(true),
                source: z
                  .enum(["user", "agent", "palette", "migrate", "authoring"])
                  .optional(),
              })
              .strict(),
          )
          .max(20)
          .optional(),
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
  const isConfig = seed.type === "config";
  const kind =
    seed.type === "human" || seed.humanMode ? ("human" as const) : ("machine" as const);
  const dutyItems: LoopDutyItem[] | undefined = isConfig
    ? undefined
    : seed.dutyItems && seed.dutyItems.length > 0
      ? (seed.dutyItems as LoopDutyItem[])
      : seedDutyItemsFromCapabilityPrompt(seed.prompt, {
          kind,
          title: seed.title,
        });
  return {
    id,
    title: seed.title,
    prompt: seed.prompt,
    position,
    type: seed.type as LoopIntentNodeType,
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
    ...(seed.satelliteKind
      ? { satelliteKind: seed.satelliteKind as LoopSatelliteKind }
      : {}),
    ...(seed.configRef ? { configRef: seed.configRef as LoopConfigRef } : {}),
    ...(typeof seed.waitMs === "number" ? { waitMs: seed.waitMs } : {}),
    ...(seed.scheduleMode ? { scheduleMode: seed.scheduleMode } : {}),
    ...(seed.scheduleAt ? { scheduleAt: seed.scheduleAt } : {}),
    ...(seed.actionParams ? { actionParams: seed.actionParams } : {}),
    ...(dutyItems && dutyItems.length > 0 ? { dutyItems } : {}),
  };
}

export const LOOP_PALETTE_ITEMS: LoopPaletteItem[] = [
  {
    id: "workgroup.create",
    category: "workgroup",
    title: "Empty Work Group",
    description:
      "Dashed squad frame with a Supervisor who can propose specialists",
    seed: {
      // Placeholder seed — store creates a LoopWorkGroup, not a duty node.
      title: "Work Group",
      prompt: "Agent work group container",
      type: "agent",
    },
  },
  /**
   * Built-in departments: one-click work groups of curated specialists.
   * Store routes these ids to placeDepartmentWorkGroup (not a duty node).
   */
  ...LOOP_DEPARTMENT_TEMPLATES.map((department) => ({
    id: department.id,
    category: "workgroup" as const,
    title: department.title,
    description: department.description,
    seed: {
      title: department.title,
      prompt: department.description,
      type: "agent" as const,
    },
  })),
  /**
   * Opens the workforce / talent picker (installed specialists + create).
   * Not a drop-in duty by itself — Palette routes click → AgentPicker.
   */
  {
    id: "agent.workforce",
    category: "agent",
    title: "My Agents",
    description: "Pick an installed specialist or create one",
    seed: {
      title: "Specialist Agent",
      prompt: "Specialist agent bound from the project workforce.",
      type: "agent",
    },
  },
  /** Fallback seed id for programmatic place (create-agent → canvas). */
  {
    id: "agent.specialist",
    category: "agent",
    title: "Specialist Agent",
    description: "Project specialist agent (bound definition)",
    seed: {
      title: "Specialist Agent",
      prompt: "Execute the assigned specialist duty for this loop.",
      type: "agent",
    },
  },
  /**
   * Default Work Group Supervisor — seeded into empty work groups as the
   * coordinator. Detects gaps and proposes admitting specialists (HITL).
   */
  {
    id: "agent.curated.workgroup-supervisor",
    category: "agent",
    title: "Supervisor",
    description:
      "Work-group staffing officer — intake, detect gaps, propose specialists, dispatch, summarize.",
    seed: {
      title: "Supervisor",
      prompt:
        "Lead this work group: intake the goal, detect capability gaps, propose admitting specialists when needed, dispatch tasks, and summarize the exit handoff.",
      type: "agent",
      agentRole: "planner",
      dutyItems: [
        {
          id: "duty_wg_sv_intake",
          text: "Intake the work-group goal and break it into specialist-sized tasks",
          kind: "machine",
          required: true,
          source: "palette",
        },
        {
          id: "duty_wg_sv_gap",
          text: "Detect capability gaps or bottlenecks that current members cannot cover",
          kind: "machine",
          required: true,
          source: "palette",
        },
        {
          id: "duty_wg_sv_propose",
          text: "Propose admitting a specialist when a gap is found (await human confirm)",
          kind: "human",
          required: true,
          source: "palette",
        },
        {
          id: "duty_wg_sv_dispatch",
          text: "Dispatch tasks to members and track progress until the squad can exit",
          kind: "machine",
          required: true,
          source: "palette",
        },
        {
          id: "duty_wg_sv_summarize",
          text: "Summarize outcomes and hand off through the work-group exit",
          kind: "machine",
          required: true,
          source: "palette",
        },
      ],
    },
  },
  {
    id: "agent.curated.product-planner",
    category: "agent",
    title: "Product Planner",
    description: "Requirements, user stories, plans, and acceptance criteria.",
    seed: {
      title: "Product Planner",
      prompt:
        "Clarify goals and constraints, then produce PRDs, prioritized tasks, and testable acceptance criteria.",
      type: "agent",
      agentRole: "planner",
    },
  },
  {
    id: "agent.curated.software-architect",
    category: "agent",
    title: "Architect",
    description: "System design, module boundaries, APIs, and ADRs.",
    seed: {
      title: "Architect",
      prompt:
        "Analyze repo architecture and propose modular boundaries, API contracts, and ADRs.",
      type: "agent",
      agentRole: "architect",
    },
  },
  {
    id: "agent.curated.ui-ux-designer",
    category: "agent",
    title: "UI/UX Designer",
    description: "Flows, layouts, design systems, and usability guidance.",
    seed: {
      title: "UI/UX Designer",
      prompt:
        "Describe flows, layouts, and interaction states using the project's existing design language.",
      type: "agent",
      agentRole: "documenter",
    },
  },
  {
    id: "agent.curated.frontend-engineer",
    category: "agent",
    title: "Frontend Engineer",
    description: "Web UI, components, state, and client performance.",
    seed: {
      title: "Frontend Engineer",
      prompt:
        "Implement accessible UI following the repository's real frontend stack and patterns.",
      type: "agent",
      agentRole: "coder",
    },
  },
  {
    id: "agent.curated.backend-engineer",
    category: "agent",
    title: "Backend Engineer",
    description: "APIs, business logic, data access, and auth integration.",
    seed: {
      title: "Backend Engineer",
      prompt:
        "Implement APIs and business logic matching existing data, auth, and contract patterns.",
      type: "agent",
      agentRole: "coder",
    },
  },
  {
    id: "agent.curated.fullstack-engineer",
    category: "agent",
    title: "Full-Stack Engineer",
    description: "End-to-end features across UI, API, and data.",
    seed: {
      title: "Full-Stack Engineer",
      prompt:
        "Deliver thin vertical slices that keep client and server contracts aligned.",
      type: "agent",
      agentRole: "coder",
    },
  },
  {
    id: "agent.curated.senior-software-engineer",
    category: "agent",
    title: "Senior Engineer",
    description: "Hard problems, refactors, performance, and engineering judgment.",
    seed: {
      title: "Senior Engineer",
      prompt:
        "Solve hard bugs, refactors, and performance issues with evidence and controlled blast radius.",
      type: "agent",
      agentRole: "coder",
    },
  },
  {
    id: "agent.curated.code-reviewer",
    category: "agent",
    title: "Code Reviewer",
    description: "Independent review for correctness, regressions, and clarity.",
    seed: {
      title: "Code Reviewer",
      prompt:
        "Review changes for correctness, missing tests, and contract breaks; prefer concrete findings.",
      type: "agent",
      agentRole: "reviewer",
    },
  },
  {
    id: "agent.curated.qa-security",
    category: "agent",
    title: "QA & Security",
    description: "Test strategy, regression checks, and baseline security hygiene.",
    seed: {
      title: "QA & Security",
      prompt:
        "Derive tests from acceptance criteria and report reproducible failures with security hygiene checks.",
      type: "agent",
      agentRole: "tester",
    },
  },
  {
    id: "agent.curated.devops-reliability",
    category: "agent",
    title: "DevOps",
    description: "CI/CD, containers, observability, and incident response basics.",
    seed: {
      title: "DevOps",
      prompt:
        "Improve CI/CD, containers, and observability using the repo's existing toolchain — never commit secrets.",
      type: "agent",
      agentRole: "debugger",
    },
  },
  {
    id: "agent.curated.ai-llm-engineer",
    category: "agent",
    title: "AI Engineer",
    description: "LLM features, RAG, agents, tool calling, and evals.",
    seed: {
      title: "AI Engineer",
      prompt:
        "Build LLM/RAG/agent features that respect harness tool policy and project patterns.",
      type: "agent",
      agentRole: "coder",
    },
  },
  {
    id: "agent.curated.mobile-crossplatform",
    category: "agent",
    title: "Mobile Engineer",
    description: "iOS, Android, and cross-platform app features.",
    seed: {
      title: "Mobile Engineer",
      prompt:
        "Implement mobile features for the platforms the user names, following the repo's existing stack.",
      type: "agent",
      agentRole: "coder",
    },
  },
  {
    id: "agent.curated.data-engineer",
    category: "agent",
    title: "Data Engineer",
    description: "Pipelines, models, warehouses, and data quality.",
    seed: {
      title: "Data Engineer",
      prompt:
        "Build or improve data pipelines with explicit freshness, schema, and quality checks.",
      type: "agent",
      agentRole: "coder",
    },
  },
  {
    id: "agent.curated.domain-specialist",
    category: "agent",
    title: "Domain Specialist",
    description: "Extensible specialist seat for vertical domains.",
    seed: {
      title: "Domain Specialist",
      prompt:
        "Ask which domain applies, then work only from user-provided domain evidence and constraints.",
      type: "agent",
      agentRole: "researcher",
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
    id: "action.slack.post_message",
    category: "action",
    title: "Slack Message",
    description: "Post a Slack message (account required — offline until configured)",
    seed: {
      title: "Slack Message",
      prompt: "Post the approved message to the configured Slack channel.",
      type: "action",
      actionIntegration: "slack",
      actionOperation: "post_message",
    },
  },
  {
    id: "action.feishu.post_message",
    category: "action",
    title: "飞书消息",
    description:
      "Send a Feishu IM message (domestic open.feishu.cn — not Lark; offline until configured)",
    seed: {
      title: "飞书消息",
      prompt: "Send the approved message to the configured Feishu chat.",
      type: "action",
      actionIntegration: "feishu",
      actionOperation: "post_message",
    },
  },
  {
    id: "action.lark.post_message",
    category: "action",
    title: "Lark Message",
    description:
      "Post a Lark message (international Lark brand — not Feishu; offline until configured)",
    seed: {
      title: "Lark Message",
      prompt: "Post the approved message to the configured Lark chat.",
      type: "action",
      actionIntegration: "lark",
      actionOperation: "post_message",
    },
  },
  {
    id: "action.sentry.list_issues",
    category: "action",
    title: "Sentry Issues",
    description: "List Sentry issues (API token required — offline until configured)",
    seed: {
      title: "Sentry Issues",
      prompt: "List recent Sentry issues for the configured project.",
      type: "action",
      actionIntegration: "sentry",
      actionOperation: "list_issues",
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
    id: "logic.retry",
    category: "logic",
    title: "Retry",
    description: "Bounded redirect back to a repair target",
    seed: {
      title: "Retry",
      prompt: "Retry the upstream failure path until maxIterations.",
      type: "logic",
      logicKind: "retry",
      maxIterations: 3,
    },
  },
  {
    id: "logic.wait",
    category: "logic",
    title: "Wait",
    description: "Wait until inbound depends parents succeed",
    seed: {
      title: "Wait",
      prompt: "Wait for inbound parents or an external condition.",
      type: "logic",
      logicKind: "wait",
    },
  },
  {
    id: "logic.schedule",
    category: "logic",
    title: "Schedule",
    description: "Arm a wall-clock time that auto-starts a Loop Run",
    seed: {
      title: "Schedule",
      prompt: "At the scheduled time, automatically create and start a Loop Run.",
      type: "logic",
      logicKind: "schedule",
      scheduleMode: "delay",
      waitMs: 3_600_000,
      dutyItems: [
        {
          id: "duty_schedule_arm",
          text: "Arm schedule for automatic createRun",
          kind: "machine",
          required: true,
          source: "palette",
        },
        {
          id: "duty_schedule_fire",
          text: "Fire createRun when due",
          kind: "machine",
          required: true,
          source: "palette",
        },
      ],
    },
  },
  {
    id: "action.notify",
    category: "action",
    title: "Notification",
    description: "Send an in-app notification to the user",
    seed: {
      title: "Notification",
      prompt: "Notify the user via Notification Center (and system notify when unfocused).",
      type: "action",
      actionIntegration: "notify",
      actionOperation: "push",
      actionParams: {
        title: "Loop update",
        body: "A loop step needs your attention.",
      },
      dutyItems: [
        {
          id: "duty_notify_compose",
          text: "Compose notification title and body",
          kind: "machine",
          required: true,
          source: "palette",
        },
        {
          id: "duty_notify_deliver",
          text: "Deliver to Notification Center",
          kind: "machine",
          required: true,
          source: "palette",
        },
      ],
    },
  },
  {
    id: "action.lab.verify",
    category: "action",
    title: "Lab",
    description: "Open Product Lab with upstream acceptance checklist",
    seed: {
      title: "Lab Verify",
      prompt:
        "Open a Lab session to accept upstream Agent work against a merged acceptance checklist.",
      type: "action",
      actionIntegration: "lab",
      actionOperation: "verify",
      dutyItems: [
        {
          id: "duty_lab_open",
          text: "Open Lab session with acceptance checklist",
          kind: "human",
          required: true,
          source: "palette",
        },
        {
          id: "duty_lab_accept",
          text: "Complete required acceptance items",
          kind: "human",
          required: true,
          source: "palette",
        },
      ],
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
  {
    id: "config.model",
    category: "config",
    title: "Model",
    description: "Chat model profile for an Agent (wire to Model*)",
    seed: {
      title: "Model",
      prompt: "",
      type: "config",
      satelliteKind: "model",
      configRef: {},
    },
  },
  {
    id: "config.memory.project",
    category: "config",
    title: "Memory · Project",
    description: "Project memory mount for an Agent",
    seed: {
      title: "Memory · Project",
      prompt: "",
      type: "config",
      satelliteKind: "memory",
      configRef: { memoryMode: "project" },
    },
  },
  {
    id: "config.memory.buffer",
    category: "config",
    title: "Memory · Buffer",
    description: "Short buffer memory mount for an Agent",
    seed: {
      title: "Memory · Buffer",
      prompt: "",
      type: "config",
      satelliteKind: "memory",
      configRef: { memoryMode: "buffer" },
    },
  },
  {
    id: "config.skill",
    category: "config",
    title: "Skill",
    description: "Installed skill capability (wire to Capability)",
    seed: {
      title: "Skill",
      prompt: "",
      type: "config",
      satelliteKind: "skill",
      configRef: {},
    },
  },
  {
    id: "config.mcp",
    category: "config",
    title: "MCP",
    description: "Installed MCP server capability (wire to Capability)",
    seed: {
      title: "MCP",
      prompt: "",
      type: "config",
      satelliteKind: "mcp",
      configRef: {},
    },
  },
].map((item) => LoopPaletteItemSchema.parse(item));

/** Palette ids for curated marketplace Templates (`agent.curated.*`). */
export const LOOP_CURATED_AGENT_PALETTE_PREFIX = "agent.curated.";

/**
 * Map `agent.curated.product-planner` → `curated.product-planner`.
 * Returns null for non-curated palette ids (workforce / specialist fallback).
 */
export function loopPaletteAgentListingId(
  paletteItemId: string,
): string | null {
  if (!paletteItemId.startsWith(LOOP_CURATED_AGENT_PALETTE_PREFIX)) return null;
  return `curated.${paletteItemId.slice(LOOP_CURATED_AGENT_PALETTE_PREFIX.length)}`;
}

export function isLoopCuratedAgentPaletteItem(paletteItemId: string): boolean {
  return loopPaletteAgentListingId(paletteItemId) !== null;
}

function paletteSeed(id: string): Seed {
  const item = LOOP_PALETTE_ITEMS.find((entry) => entry.id === id);
  if (!item) throw new Error(`Missing palette item ${id}`);
  return item.seed;
}

function featureDevelopmentDraft(): IntentGraph {
  const nodes: IntentGraphNode[] = [
    seedNode("n_planner", paletteSeed("agent.curated.product-planner"), {
      x: 40,
      y: 40,
    }),
    seedNode("n_plan_review", paletteSeed("human.review"), { x: 40, y: 140 }),
    seedNode("n_coder", paletteSeed("agent.curated.frontend-engineer"), {
      x: 40,
      y: 240,
    }),
    seedNode("n_test", paletteSeed("action.test"), { x: 40, y: 340 }),
    seedNode("n_condition", paletteSeed("logic.condition"), { x: 40, y: 440 }),
    seedNode("n_reviewer", paletteSeed("agent.curated.code-reviewer"), {
      x: 280,
      y: 440,
    }),
    seedNode("n_approval", paletteSeed("human.approval"), { x: 280, y: 540 }),
    seedNode("n_create_pr", paletteSeed("action.github.create_pr"), {
      x: 280,
      y: 640,
    }),
  ];

  return IntentGraphSchema.parse({
    revision: 1,
    graphPrompt:
      "Feature development: plan → human review → implement → test → branch → review → approve PR.",
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
        prompt: "Tests passed → code review",
      },
      {
        id: "e6",
        source: "n_condition",
        target: "n_coder",
        kind: "conditional",
        branchKey: "fail",
        prompt: "Tests failed → return errors to Frontend Engineer",
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

function parallelResearchDraft(): IntentGraph {
  const nodes: IntentGraphNode[] = [
    seedNode("n_planner", paletteSeed("agent.curated.product-planner"), {
      x: 40,
      y: 40,
    }),
    seedNode("n_research", paletteSeed("agent.curated.domain-specialist"), {
      x: 40,
      y: 160,
    }),
    seedNode("n_design", paletteSeed("agent.curated.software-architect"), {
      x: 280,
      y: 160,
    }),
    seedNode("n_merge", paletteSeed("logic.merge"), { x: 160, y: 280 }),
    seedNode("n_review", paletteSeed("human.review"), { x: 160, y: 400 }),
  ];

  return IntentGraphSchema.parse({
    revision: 1,
    graphPrompt:
      "Parallel research: plan fans out to Domain Specialist ∥ Architect, then Merge and Human Review.",
    nodes,
    edges: [
      {
        id: "e1",
        source: "n_planner",
        target: "n_research",
        kind: "depends",
        prompt: "Fan-out: research branch",
      },
      {
        id: "e2",
        source: "n_planner",
        target: "n_design",
        kind: "depends",
        prompt: "Fan-out: design branch",
      },
      {
        id: "e3",
        source: "n_research",
        target: "n_merge",
        kind: "depends",
        prompt: "Join research",
      },
      {
        id: "e4",
        source: "n_design",
        target: "n_merge",
        kind: "depends",
        prompt: "Join design",
      },
      {
        id: "e5",
        source: "n_merge",
        target: "n_review",
        kind: "depends",
        prompt: "Human reviews merged results",
      },
    ],
  });
}

export const LOOP_GRAPH_PRESETS: LoopGraphPreset[] = [
  LoopGraphPresetSchema.parse({
    id: "feature_development",
    title: "Feature Development",
    description:
      "Product Planner → Human Review → Frontend Engineer → Tests → Condition → Code Reviewer → Approval → Create PR",
    draft: featureDevelopmentDraft(),
  }),
  LoopGraphPresetSchema.parse({
    id: "parallel_research",
    title: "Parallel Research",
    description:
      "Product Planner → (Domain Specialist ∥ Architect) → Merge → Human Review",
    draft: parallelResearchDraft(),
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
