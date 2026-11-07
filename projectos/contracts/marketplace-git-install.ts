import { z } from "zod";
import { SkillDescriptorSchema } from "./skills.js";
import type { ProjectOSSettings } from "./settings.js";

export const MarketplaceGitInstallKindSchema = z.enum([
  "mcp",
  "skills",
  "rules",
  "agents",
  "workflows",
  "stencils",
]);

export const InstallFromGitUrlInputSchema = z
  .object({
    url: z.string().min(1).max(2_048),
    kind: MarketplaceGitInstallKindSchema,
    /** When true, overwrite an existing pack / skill / MCP with the same id. */
    replace: z.boolean().optional(),
  })
  .strict();

export const InstallFromGitUrlConflictSchema = z
  .object({
    status: z.literal("conflict"),
    kind: MarketplaceGitInstallKindSchema,
    existingId: z.string().min(1).max(120),
    existingName: z.string().min(1).max(200),
    message: z.string().min(1).max(1_024),
  })
  .strict();

export const InstallFromGitUrlFailedSchema = z
  .object({
    status: z.literal("failed"),
    kind: MarketplaceGitInstallKindSchema,
    message: z.string().min(1).max(4_096),
    /** UI should offer handing the URL to the chat agent. */
    agentFallbackSuggested: z.literal(true),
  })
  .strict();

export const InstallFromGitUrlSkillOkSchema = z
  .object({
    status: z.literal("installed"),
    kind: z.literal("skills"),
    skill: SkillDescriptorSchema,
    sourceUrl: z.string().min(1).max(2_048),
  })
  .strict();

export const InstallFromGitUrlMcpOkSchema = z
  .object({
    status: z.literal("installed"),
    kind: z.literal("mcp"),
    serverId: z.string().min(1).max(120),
    sourceUrl: z.string().min(1).max(2_048),
  })
  .strict();

export const InstallFromGitUrlRulesOkSchema = z
  .object({
    status: z.literal("installed"),
    kind: z.literal("rules"),
    packId: z.string().min(1).max(120),
    sourceUrl: z.string().min(1).max(2_048),
  })
  .strict();

export const InstallFromGitUrlAgentsOkSchema = z
  .object({
    status: z.literal("installed"),
    kind: z.literal("agents"),
    listingId: z.string().min(1).max(120),
    sourceUrl: z.string().min(1).max(2_048),
  })
  .strict();

export const InstallFromGitUrlWorkflowsOkSchema = z
  .object({
    status: z.literal("installed"),
    kind: z.literal("workflows"),
    listingId: z.string().min(1).max(120),
    sourceUrl: z.string().min(1).max(2_048),
  })
  .strict();

export const InstallFromGitUrlStencilsOkSchema = z
  .object({
    status: z.literal("installed"),
    kind: z.literal("stencils"),
    listingId: z.string().min(1).max(120),
    sourceUrl: z.string().min(1).max(2_048),
  })
  .strict();

// Plain union: multiple success variants share status "installed", which Zod
// discriminatedUnion forbids (duplicate discriminator values).
export const InstallFromGitUrlResultSchema = z.union([
  InstallFromGitUrlSkillOkSchema,
  InstallFromGitUrlMcpOkSchema,
  InstallFromGitUrlRulesOkSchema,
  InstallFromGitUrlAgentsOkSchema,
  InstallFromGitUrlWorkflowsOkSchema,
  InstallFromGitUrlStencilsOkSchema,
  InstallFromGitUrlConflictSchema,
  InstallFromGitUrlFailedSchema,
]);

export type MarketplaceGitInstallKind = z.infer<
  typeof MarketplaceGitInstallKindSchema
>;
export type InstallFromGitUrlInput = z.infer<typeof InstallFromGitUrlInputSchema>;
export type InstallFromGitUrlConflict = z.infer<typeof InstallFromGitUrlConflictSchema>;
export type InstallFromGitUrlFailed = z.infer<typeof InstallFromGitUrlFailedSchema>;
export type InstallFromGitUrlSkillOk = z.infer<typeof InstallFromGitUrlSkillOkSchema>;
export type InstallFromGitUrlMcpOk = z.infer<typeof InstallFromGitUrlMcpOkSchema> & {
  settings: ProjectOSSettings;
};
export type InstallFromGitUrlRulesOk = z.infer<typeof InstallFromGitUrlRulesOkSchema>;
export type InstallFromGitUrlAgentsOk = z.infer<
  typeof InstallFromGitUrlAgentsOkSchema
>;
export type InstallFromGitUrlWorkflowsOk = z.infer<
  typeof InstallFromGitUrlWorkflowsOkSchema
>;
export type InstallFromGitUrlStencilsOk = z.infer<
  typeof InstallFromGitUrlStencilsOkSchema
>;
export type InstallFromGitUrlResult =
  | InstallFromGitUrlSkillOk
  | InstallFromGitUrlMcpOk
  | InstallFromGitUrlRulesOk
  | InstallFromGitUrlAgentsOk
  | InstallFromGitUrlWorkflowsOk
  | InstallFromGitUrlStencilsOk
  | InstallFromGitUrlConflict
  | InstallFromGitUrlFailed;
