import { z } from "zod";
import { SkillDescriptorSchema } from "./skills.js";
import type { ProjectOSSettings } from "./settings.js";

export const MarketplaceGitInstallKindSchema = z.enum(["mcp", "skills"]);

export const InstallFromGitUrlInputSchema = z
  .object({
    url: z.string().min(1).max(2_048),
    kind: MarketplaceGitInstallKindSchema,
    /** When true, overwrite an existing skill / MCP with the same id. */
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

// Plain union: both skill/mcp success share status "installed", which Zod
// discriminatedUnion forbids (duplicate discriminator values).
export const InstallFromGitUrlResultSchema = z.union([
  InstallFromGitUrlSkillOkSchema,
  InstallFromGitUrlMcpOkSchema,
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
export type InstallFromGitUrlResult =
  | InstallFromGitUrlSkillOk
  | InstallFromGitUrlMcpOk
  | InstallFromGitUrlConflict
  | InstallFromGitUrlFailed;
