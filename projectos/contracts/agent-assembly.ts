import { z } from "zod";

import { WorkforceAgentDraftSchema } from "./agent-workforce.js";
import { CapabilityTrustTierSchema } from "./capability-marketplace.js";

export const AssemblySearchScopeSchema = z.enum(["local", "local_and_catalog"]);

export const AssemblyBindingActionSchema = z.enum([
  "bind",
  "install_then_bind",
  "suggest_install_only",
]);

export const AssemblyBindingKindSchema = z.enum([
  "skill",
  "mcp",
  "rules",
  "workflow",
  "stencil",
]);

export const AssemblyBindingSourceSchema = z.enum([
  "installed",
  "catalog",
  "git-url",
]);

export const AssemblyBindingRiskSchema = z.enum(["community_mcp"]);

export const AssemblyBindingSchema = z
  .object({
    kind: AssemblyBindingKindSchema,
    id: z.string().min(1).max(120),
    name: z.string().min(1).max(200),
    trustTier: CapabilityTrustTierSchema.optional(),
    source: AssemblyBindingSourceSchema,
    installed: z.boolean(),
    selected: z.boolean(),
    action: AssemblyBindingActionSchema,
    rationale: z.string().max(512).optional(),
    /** Catalog listing id when install is needed (may equal id). */
    listingId: z.string().min(1).max(120).optional(),
    risk: AssemblyBindingRiskSchema.optional(),
  })
  .strict();

export const AssembleWorkforceAgentRequestSchema = z
  .object({
    projectId: z.string().min(1),
    prompt: z.string().trim().min(1).max(4_000),
    scope: AssemblySearchScopeSchema,
    seedSkillIds: z.array(z.string().min(1).max(120)).max(64).optional(),
    seedMcpServerIds: z.array(z.string().min(1).max(80)).max(64).optional(),
  })
  .strict();

export const AssembleWorkforceAgentResultSchema = z
  .object({
    draft: WorkforceAgentDraftSchema,
    sourcePrompt: z.string().min(1),
    scope: AssemblySearchScopeSchema,
    bindings: z.array(AssemblyBindingSchema).max(256),
    gaps: z.array(z.string().min(1).max(240)).max(32).optional(),
    rationale: z.string().max(2_000).optional(),
  })
  .strict();

export type AssemblySearchScope = z.infer<typeof AssemblySearchScopeSchema>;
export type AssemblyBindingAction = z.infer<typeof AssemblyBindingActionSchema>;
export type AssemblyBindingKind = z.infer<typeof AssemblyBindingKindSchema>;
export type AssemblyBindingSource = z.infer<typeof AssemblyBindingSourceSchema>;
export type AssemblyBindingRisk = z.infer<typeof AssemblyBindingRiskSchema>;
export type AssemblyBinding = z.infer<typeof AssemblyBindingSchema>;
export type AssembleWorkforceAgentRequest = z.infer<
  typeof AssembleWorkforceAgentRequestSchema
>;
export type AssembleWorkforceAgentResult = z.infer<
  typeof AssembleWorkforceAgentResultSchema
>;
