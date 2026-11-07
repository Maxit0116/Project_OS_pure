import { z } from "zod";

/**
 * Capability Marketplace kinds (Capability-Marketplace-Dev-Plan).
 * MCP / Skill keep legacy listing schemas; newer kinds share this envelope.
 */
export const CapabilityKindSchema = z.enum([
  "mcp",
  "skill",
  "rules",
  "workflow",
  "agent",
  "stencil",
]);

export const CapabilityTrustTierSchema = z.enum(["curated", "community"]);

export const CapabilityDependsOnSchema = z
  .object({
    skills: z.array(z.string().min(1).max(120)).max(64).optional(),
    mcpListings: z.array(z.string().min(1).max(120)).max(64).optional(),
    rules: z.array(z.string().min(1).max(120)).max(64).optional(),
  })
  .strict();

export const CapabilityPackMetaSchema = z
  .object({
    id: z.string().min(1).max(120),
    name: z.string().min(1).max(120),
    description: z.string().max(4_096).optional(),
    version: z.string().min(1).max(64),
    kind: CapabilityKindSchema,
    trustTier: CapabilityTrustTierSchema,
    homepage: z.string().url().max(2_048).optional(),
    iconUrl: z.string().min(1).max(2_048).optional(),
    dependsOn: CapabilityDependsOnSchema.optional(),
  })
  .strict();

export const CapabilityPackProvenanceSchema = z
  .object({
    listingId: z.string().min(1).max(120),
    catalogVersion: z.string().min(1).max(32),
    trustTier: CapabilityTrustTierSchema,
    listingVersion: z.string().min(1).max(64),
    installedAt: z.string().min(1).max(64),
    source: z
      .enum(["catalog", "manual", "git-url", "export-reimport"])
      .default("catalog"),
    kind: CapabilityKindSchema,
    gitUrl: z.string().url().max(2_048).optional(),
    gitCommit: z.string().min(1).max(64).optional(),
  })
  .strict();

/**
 * Overlay tabs that ship with a catalog today.
 * Empty future kinds stay hidden until their phase lands.
 */
export const ACTIVE_MARKETPLACE_KINDS = [
  "mcp",
  "skill",
  "rules",
  "agent",
  "workflow",
  "stencil",
] as const;

export type ActiveMarketplaceKind = (typeof ACTIVE_MARKETPLACE_KINDS)[number];

export type CapabilityKind = z.infer<typeof CapabilityKindSchema>;
export type CapabilityTrustTier = z.infer<typeof CapabilityTrustTierSchema>;
export type CapabilityDependsOn = z.infer<typeof CapabilityDependsOnSchema>;
export type CapabilityPackMeta = z.infer<typeof CapabilityPackMetaSchema>;
export type CapabilityPackProvenance = z.infer<
  typeof CapabilityPackProvenanceSchema
>;
