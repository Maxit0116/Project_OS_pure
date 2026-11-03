/** Mirrors IntentNodeRole — kept here to avoid circular imports with loop-graph. */
export type LegacyIntentNodeRole =
  | "implement"
  | "verify"
  | "fix"
  | "decide"
  | "unknown";

export const LOOP_NODE_TYPES = ["agent", "action", "logic", "human"] as const;
export type LoopNodeType = (typeof LOOP_NODE_TYPES)[number];

export const LOOP_AGENT_ROLES = [
  "planner",
  "coder",
  "reviewer",
  "researcher",
  "tester",
  "debugger",
  "architect",
  "documenter",
] as const;
export type LoopAgentRole = (typeof LOOP_AGENT_ROLES)[number];

export const LOOP_HUMAN_MODES = [
  "approval",
  "review",
  "input",
  "decision",
  "takeover",
] as const;
export type LoopHumanMode = (typeof LOOP_HUMAN_MODES)[number];

export const LOOP_ACTION_INTEGRATIONS = ["github", "test", "terminal"] as const;
export type LoopActionIntegration = (typeof LOOP_ACTION_INTEGRATIONS)[number];

export const LOOP_LOGIC_KINDS = [
  "condition",
  "loop",
  "merge",
  "exit",
  "retry",
  "wait",
] as const;
export type LoopLogicKind = (typeof LOOP_LOGIC_KINDS)[number];

/** Common GitHub operations exposed as Action shortcuts (same schema). */
export const LOOP_GITHUB_OPERATIONS = [
  "create_branch",
  "commit",
  "push",
  "create_pr",
  "update_pr",
  "get_issue",
  "create_issue",
  "get_pr_status",
] as const;
export type LoopGitHubOperation = (typeof LOOP_GITHUB_OPERATIONS)[number];

export interface LoopNodeArchitectureFields {
  type?: LoopNodeType;
  agentRole?: LoopAgentRole;
  humanMode?: LoopHumanMode;
  actionIntegration?: LoopActionIntegration;
  actionOperation?: string;
  logicKind?: LoopLogicKind;
  /** Required for logicKind === "loop" (and recommended on feedback gates). */
  maxIterations?: number;
  repairMode?: boolean;
}

export interface LoopArchitectureMapping extends LoopNodeArchitectureFields {
  type: LoopNodeType;
}

/** Map legacy IntentNodeRole → architecture fields (NA-D10). */
export function architectureFromLegacyRole(
  role: LegacyIntentNodeRole | undefined,
): LoopArchitectureMapping {
  switch (role) {
    case "verify":
      return {
        type: "action",
        actionIntegration: "test",
        actionOperation: "run",
      };
    case "decide":
      return { type: "human", humanMode: "approval" };
    case "fix":
      return { type: "agent", agentRole: "coder", repairMode: true };
    case "implement":
      return { type: "agent", agentRole: "coder" };
    case "unknown":
    default:
      return { type: "agent", agentRole: "coder" };
  }
}

/**
 * Bridge architecture → legacy role so P-0–P-3 runtime keeps working
 * until type-dispatched steppers land (NA-3 / NA-4).
 */
export function legacyRoleFromArchitecture(
  fields: LoopNodeArchitectureFields,
): LegacyIntentNodeRole {
  if (fields.type === "human") return "decide";
  if (fields.type === "action" && fields.actionIntegration === "test") {
    return "verify";
  }
  if (fields.type === "action") {
    // GitHub / Terminal: treat as gated human-facing step until Action runtime exists.
    return "decide";
  }
  if (fields.type === "logic") {
    if (fields.logicKind === "exit") return "decide";
    // Condition / loop / merge: placeholder until Logic steppers exist.
    return "unknown";
  }
  if (fields.repairMode || fields.agentRole === "coder") {
    return fields.repairMode ? "fix" : "implement";
  }
  if (fields.agentRole === "planner" || fields.agentRole === "reviewer") {
    return "implement";
  }
  return "implement";
}

export function resolveNodeArchitecture(
  node: LoopNodeArchitectureFields & { role?: LegacyIntentNodeRole },
): LoopArchitectureMapping {
  if (node.type) {
    return {
      type: node.type,
      ...(node.agentRole ? { agentRole: node.agentRole } : {}),
      ...(node.humanMode ? { humanMode: node.humanMode } : {}),
      ...(node.actionIntegration
        ? { actionIntegration: node.actionIntegration }
        : {}),
      ...(node.actionOperation ? { actionOperation: node.actionOperation } : {}),
      ...(node.logicKind ? { logicKind: node.logicKind } : {}),
      ...(typeof node.maxIterations === "number"
        ? { maxIterations: node.maxIterations }
        : {}),
      ...(node.repairMode ? { repairMode: true } : {}),
    };
  }
  return architectureFromLegacyRole(node.role);
}

export function withArchitectureDefaults<
  T extends LoopNodeArchitectureFields & { role?: LegacyIntentNodeRole },
>(node: T): T & LoopArchitectureMapping & { role: LegacyIntentNodeRole } {
  const arch = resolveNodeArchitecture(node);
  return {
    ...node,
    ...arch,
    role:
      node.role && node.role !== "unknown"
        ? node.role
        : legacyRoleFromArchitecture(arch),
  };
}

export function isConditionNode(
  node: LoopNodeArchitectureFields & { role?: LegacyIntentNodeRole },
): boolean {
  const arch = resolveNodeArchitecture(node);
  return arch.type === "logic" && arch.logicKind === "condition";
}

export function isMergeNode(
  node: LoopNodeArchitectureFields & { role?: LegacyIntentNodeRole },
): boolean {
  const arch = resolveNodeArchitecture(node);
  return arch.type === "logic" && arch.logicKind === "merge";
}

export function isLoopLogicNode(
  node: LoopNodeArchitectureFields & { role?: LegacyIntentNodeRole },
): boolean {
  const arch = resolveNodeArchitecture(node);
  return arch.type === "logic" && arch.logicKind === "loop";
}
