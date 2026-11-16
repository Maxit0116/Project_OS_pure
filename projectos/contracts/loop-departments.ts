import type { AgentDepartment } from "./agent-marketplace.js";

/**
 * Built-in Loop Graph departments: pre-composed work groups of curated
 * specialist agents (company “department” units on the L1 canvas).
 */
export const LOOP_DEPARTMENT_PALETTE_PREFIX = "workgroup.department.";

export type LoopDepartmentTemplate = {
  /** Palette id, e.g. `workgroup.department.product-architecture`. */
  id: string;
  department: AgentDepartment;
  title: string;
  description: string;
  /** Curated agent palette ids (`agent.curated.*`) placed as WG members. */
  memberPaletteIds: readonly string[];
  /** Index into `memberPaletteIds` for the default coordinator. */
  coordinatorMemberIndex: number;
};

function defineDepartment(
  template: LoopDepartmentTemplate,
): LoopDepartmentTemplate {
  if (!template.id.startsWith(LOOP_DEPARTMENT_PALETTE_PREFIX)) {
    throw new Error(
      `Department id must start with ${LOOP_DEPARTMENT_PALETTE_PREFIX}`,
    );
  }
  if (
    template.coordinatorMemberIndex < 0 ||
    template.coordinatorMemberIndex >= template.memberPaletteIds.length
  ) {
    throw new Error("coordinatorMemberIndex out of range");
  }
  for (const memberId of template.memberPaletteIds) {
    if (!memberId.startsWith("agent.curated.")) {
      throw new Error(`Department member must be curated agent: ${memberId}`);
    }
  }
  return template;
}

/**
 * Official department squads. `specialist_pool` is browse-only in Marketplace
 * and is intentionally omitted here.
 */
export const LOOP_DEPARTMENT_TEMPLATES: readonly LoopDepartmentTemplate[] = [
  defineDepartment({
    id: "workgroup.department.product-architecture",
    department: "product_architecture",
    title: "Product & Architecture",
    description:
      "Clarify goals, system boundaries, and UX — Product Planner, Architect, UI/UX Designer.",
    memberPaletteIds: [
      "agent.curated.product-planner",
      "agent.curated.software-architect",
      "agent.curated.ui-ux-designer",
    ],
    coordinatorMemberIndex: 0,
  }),
  defineDepartment({
    id: "workgroup.department.software-development",
    department: "software_development",
    title: "Software Development",
    description:
      "Ship features end-to-end — Frontend, Backend, Full-Stack, and Senior Engineer.",
    memberPaletteIds: [
      "agent.curated.frontend-engineer",
      "agent.curated.backend-engineer",
      "agent.curated.fullstack-engineer",
      "agent.curated.senior-software-engineer",
    ],
    coordinatorMemberIndex: 3,
  }),
  defineDepartment({
    id: "workgroup.department.quality-infrastructure",
    department: "quality_infrastructure",
    title: "Quality & Infrastructure",
    description:
      "Review, test, secure, and ship reliably — Code Reviewer, QA & Security, DevOps.",
    memberPaletteIds: [
      "agent.curated.code-reviewer",
      "agent.curated.qa-security",
      "agent.curated.devops-reliability",
    ],
    coordinatorMemberIndex: 0,
  }),
  defineDepartment({
    id: "workgroup.department.ai-engineering",
    department: "ai_engineering",
    title: "AI Engineering",
    description:
      "LLM features, agents, and domain grounding — AI Engineer and Domain Specialist.",
    memberPaletteIds: [
      "agent.curated.ai-llm-engineer",
      "agent.curated.domain-specialist",
    ],
    coordinatorMemberIndex: 0,
  }),
];

export function getLoopDepartmentTemplate(
  id: string,
): LoopDepartmentTemplate | undefined {
  return LOOP_DEPARTMENT_TEMPLATES.find((entry) => entry.id === id);
}

export function isLoopDepartmentPaletteItem(paletteItemId: string): boolean {
  return getLoopDepartmentTemplate(paletteItemId) !== undefined;
}

export function listLoopDepartmentTemplates(
  department?: AgentDepartment,
): LoopDepartmentTemplate[] {
  if (!department) return [...LOOP_DEPARTMENT_TEMPLATES];
  return LOOP_DEPARTMENT_TEMPLATES.filter(
    (entry) => entry.department === department,
  );
}
