/**
 * Work Group / Department Supervisor — seed agent + staffing proposals.
 *
 * Coordinator (compile topology hub) and Supervisor (staffing officer) are the
 * same surface agent by default. Empty work groups seed a dedicated Supervisor;
 * departments / talent squads apply the same staffing duties onto their
 * coordinator.
 */

import { z } from "zod";

import type { LoopDutyItem } from "./loop-duty.js";

/** Keep in sync with `LOOP_CURATED_AGENT_PALETTE_PREFIX` in loop-presets. */
const CURATED_AGENT_PALETTE_PREFIX = "agent.curated.";

/** Palette id for the built-in Work Group Supervisor seed. */
export const LOOP_WORK_GROUP_SUPERVISOR_PALETTE_ID =
  "agent.curated.workgroup-supervisor";

/** Marketplace listing id mirrored by {@link loopPaletteAgentListingId}. */
export const LOOP_WORK_GROUP_SUPERVISOR_LISTING_ID =
  "curated.workgroup-supervisor";

/** Stable duty ids — used to detect / merge supervisor responsibilities. */
export const LOOP_WORK_GROUP_SUPERVISOR_DUTY_IDS = {
  intake: "duty_wg_sv_intake",
  detectGap: "duty_wg_sv_gap",
  propose: "duty_wg_sv_propose",
  dispatch: "duty_wg_sv_dispatch",
  summarize: "duty_wg_sv_summarize",
} as const;

export const LOOP_WORK_GROUP_SUPERVISOR_DUTIES: readonly LoopDutyItem[] = [
  {
    id: LOOP_WORK_GROUP_SUPERVISOR_DUTY_IDS.intake,
    text: "Intake the work-group goal and break it into specialist-sized tasks",
    kind: "machine",
    required: true,
    source: "palette",
  },
  {
    id: LOOP_WORK_GROUP_SUPERVISOR_DUTY_IDS.detectGap,
    text: "Detect capability gaps or bottlenecks that current members cannot cover",
    kind: "machine",
    required: true,
    source: "palette",
  },
  {
    id: LOOP_WORK_GROUP_SUPERVISOR_DUTY_IDS.propose,
    text: "Propose admitting a specialist when a gap is found (await human confirm)",
    kind: "human",
    required: true,
    source: "palette",
  },
  {
    id: LOOP_WORK_GROUP_SUPERVISOR_DUTY_IDS.dispatch,
    text: "Dispatch tasks to members and track progress until the squad can exit",
    kind: "machine",
    required: true,
    source: "palette",
  },
  {
    id: LOOP_WORK_GROUP_SUPERVISOR_DUTY_IDS.summarize,
    text: "Summarize outcomes and hand off through the work-group exit",
    kind: "machine",
    required: true,
    source: "palette",
  },
];

export const LoopWorkGroupStaffingProposalStatusSchema = z.enum([
  "pending",
  "accepted",
  "dismissed",
]);

export type LoopWorkGroupStaffingProposalStatus = z.infer<
  typeof LoopWorkGroupStaffingProposalStatusSchema
>;

export const LoopWorkGroupStaffingProposalSchema = z
  .object({
    id: z.string().min(1).max(80),
    status: LoopWorkGroupStaffingProposalStatusSchema,
    /** Why the Supervisor wants this seat. */
    reason: z.string().trim().min(1).max(500),
    /** Preferred curated palette id (`agent.curated.*`). */
    suggestedPaletteItemId: z.string().min(1).max(120).optional(),
    /** Installed workforce definition when not placing from palette. */
    suggestedAgentDefinitionId: z.string().min(1).max(160).optional(),
    suggestedTitle: z.string().trim().min(1).max(120).optional(),
    /** Supervisor / requester node id when known. */
    requestedByNodeId: z.string().min(1).optional(),
    createdAt: z.string().min(1),
    resolvedAt: z.string().min(1).optional(),
    /** Node admitted after accept. */
    admittedNodeId: z.string().min(1).optional(),
  })
  .strict();

export type LoopWorkGroupStaffingProposal = z.infer<
  typeof LoopWorkGroupStaffingProposalSchema
>;

export function createLoopWorkGroupStaffingProposalId(): string {
  return `staff_${crypto.randomUUID()}`;
}

/** True when duty checklist already carries supervisor staffing duties. */
export function nodeHasSupervisorDuties(node: {
  dutyItems?: LoopDutyItem[] | undefined;
}): boolean {
  const ids = new Set((node.dutyItems ?? []).map((item) => item.id));
  return (
    ids.has(LOOP_WORK_GROUP_SUPERVISOR_DUTY_IDS.detectGap) &&
    ids.has(LOOP_WORK_GROUP_SUPERVISOR_DUTY_IDS.propose)
  );
}

/**
 * Merge supervisor staffing duties onto a coordinator node without duplicating
 * stable duty ids. Preserves existing duties first.
 */
export function mergeSupervisorDuties(
  existing: LoopDutyItem[] | undefined,
): LoopDutyItem[] {
  const current = existing ?? [];
  const seen = new Set(current.map((item) => item.id));
  const merged = [...current];
  for (const duty of LOOP_WORK_GROUP_SUPERVISOR_DUTIES) {
    if (seen.has(duty.id)) continue;
    merged.push(duty);
    seen.add(duty.id);
  }
  return merged.slice(0, 20);
}

export function isWorkGroupSupervisorPaletteId(paletteItemId: string): boolean {
  return paletteItemId === LOOP_WORK_GROUP_SUPERVISOR_PALETTE_ID;
}

export function isWorkGroupSupervisorDefinitionId(
  agentDefinitionId: string | null | undefined,
): boolean {
  if (!agentDefinitionId) return false;
  return (
    agentDefinitionId === `builtin:${LOOP_WORK_GROUP_SUPERVISOR_LISTING_ID}` ||
    agentDefinitionId.includes("workgroup-supervisor")
  );
}

/**
 * Lightweight keyword → curated specialist palette suggestion.
 * Used when the Supervisor (or UI) states a capability need in plain text.
 */
const SPECIALIST_NEED_HINTS: readonly {
  paletteItemId: string;
  keywords: readonly string[];
}[] = [
  {
    paletteItemId: "agent.curated.frontend-engineer",
    keywords: ["frontend", "ui", "react", "css", "前端", "界面"],
  },
  {
    paletteItemId: "agent.curated.backend-engineer",
    keywords: ["backend", "api", "server", "后端", "接口"],
  },
  {
    paletteItemId: "agent.curated.fullstack-engineer",
    keywords: ["fullstack", "full-stack", "全栈"],
  },
  {
    paletteItemId: "agent.curated.software-architect",
    keywords: ["architect", "architecture", "adr", "架构"],
  },
  {
    paletteItemId: "agent.curated.ui-ux-designer",
    keywords: ["design", "ux", "figma", "设计", "交互"],
  },
  {
    paletteItemId: "agent.curated.code-reviewer",
    keywords: ["review", "code review", "评审", "审查"],
  },
  {
    paletteItemId: "agent.curated.qa-security",
    keywords: ["qa", "test", "security", "测试", "安全"],
  },
  {
    paletteItemId: "agent.curated.devops-reliability",
    keywords: ["devops", "ci", "deploy", "infra", "运维", "部署"],
  },
  {
    paletteItemId: "agent.curated.ai-llm-engineer",
    keywords: ["llm", "ai agent", "prompt", "模型", "智能体"],
  },
  {
    paletteItemId: "agent.curated.product-planner",
    keywords: ["prd", "product", "planner", "需求", "规划"],
  },
  {
    paletteItemId: "agent.curated.domain-specialist",
    keywords: ["domain", "vertical", "领域"],
  },
  {
    paletteItemId: "agent.curated.data-engineer",
    keywords: ["data", "etl", "pipeline", "数据"],
  },
  {
    paletteItemId: "agent.curated.mobile-crossplatform",
    keywords: ["mobile", "ios", "android", "移动"],
  },
];

export function suggestSpecialistPaletteFromNeed(
  need: string,
): string | undefined {
  const hay = need.trim().toLowerCase();
  if (!hay) return undefined;
  for (const hint of SPECIALIST_NEED_HINTS) {
    if (hint.keywords.some((kw) => hay.includes(kw.toLowerCase()))) {
      return hint.paletteItemId;
    }
  }
  return undefined;
}

/** Curated specialist palette ids eligible for staffing proposals (excl. Supervisor). */
export function listStaffableCuratedPaletteIds(
  allPaletteIds: readonly string[],
): string[] {
  return allPaletteIds.filter(
    (id) =>
      id.startsWith(CURATED_AGENT_PALETTE_PREFIX) &&
      id !== LOOP_WORK_GROUP_SUPERVISOR_PALETTE_ID,
  );
}
