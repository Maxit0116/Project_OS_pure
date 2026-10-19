import { z } from "zod";

/**
 * Agent Harness ToolPolicy contracts (H0).
 *
 * Path-level allow/ask/deny decisions live here. Stronger server authority
 * (inode/device identity, recoverable transactions) remains outside Policy
 * and runs only after an allow decision.
 *
 * Distinct from Debug {@link ./harness.js} HarnessRecord archives.
 */

export const HarnessToolNameSchema = z.enum([
  "read_file",
  "list_files",
  "get_context",
  "grep_workspace",
  "generate_diff",
  "apply_diff",
  "run_verification",
  "shell",
  "mcp_tool",
  "fetch",
]);

export const PolicyDecisionKindSchema = z.enum(["allow", "ask", "deny"]);

export const HarnessCapabilityModeSchema = z.enum([
  "ask",
  "change",
  "plan",
  "debug",
  "anchored",
  "team_memory",
  "system",
]);

export const CapabilityContextSchema = z
  .object({
    mode: HarnessCapabilityModeSchema,
    /** Paths the agent may read in this turn (server-assembled). */
    allowedReadPaths: z.array(z.string()),
    /** Paths the agent may write; empty means zero write authorization. */
    allowedWritePaths: z.array(z.string()),
    /** When false, every write-side tool is denied regardless of paths. */
    writeCapability: z.boolean(),
    executionPolicy: z.enum(["automatic", "review_first"]).optional(),
  })
  .strict();

export const ToolCallRequestSchema = z
  .object({
    tool: z.string().min(1),
    path: z.string().min(1).optional(),
    paths: z.array(z.string().min(1)).max(64).optional(),
    /** MCP / shell concrete name for permission matching (H3). */
    match: z.string().min(1).optional(),
  })
  .strict();

export const PolicyDecisionSchema = z
  .object({
    decision: PolicyDecisionKindSchema,
    tool: z.string().min(1),
    reason: z.string().min(1),
  })
  .strict();

/** Project-level permission rules (`.projectos/permissions.json`). Deny > Ask > Allow. */
export const ToolPermissionRuleSchema = z
  .object({
    effect: PolicyDecisionKindSchema,
    /** Harness tool id, or `*` for all tools. */
    tool: z.union([HarnessToolNameSchema, z.literal("*")]),
    /** Optional glob-like match against `ToolCallRequest.match` (e.g. `mcp:docs:*`). */
    match: z.string().min(1).optional(),
  })
  .strict();

export const ToolPermissionDocumentSchema = z
  .object({
    version: z.literal("0.1.0"),
    rules: z.array(ToolPermissionRuleSchema).max(200),
  })
  .strict();

export type HarnessToolName = z.infer<typeof HarnessToolNameSchema>;
export type PolicyDecisionKind = z.infer<typeof PolicyDecisionKindSchema>;
export type HarnessCapabilityMode = z.infer<typeof HarnessCapabilityModeSchema>;
export type CapabilityContext = z.infer<typeof CapabilityContextSchema>;
export type ToolCallRequest = z.infer<typeof ToolCallRequestSchema>;
export type PolicyDecision = z.infer<typeof PolicyDecisionSchema>;
export type ToolPermissionRule = z.infer<typeof ToolPermissionRuleSchema>;
export type ToolPermissionDocument = z.infer<typeof ToolPermissionDocumentSchema>;

export const HARNESS_TOOL_NAMES = HarnessToolNameSchema.options;
