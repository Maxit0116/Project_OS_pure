import { z } from "zod";

import {
  CapabilityDependsOnSchema,
  CapabilityTrustTierSchema,
} from "./capability-marketplace.js";
import { WorkflowCatalogListingSchema } from "./workflow-marketplace.js";
import { StencilCatalogListingSchema } from "./stencil-marketplace.js";
import { RulesCatalogListingSchema } from "./rules-marketplace.js";

export const AgentTrustTierSchema = CapabilityTrustTierSchema;

/**
 * Catalog / export shape for a workforce agent pack.
 * Local MCP server UUIDs are never required — use dependsOn.mcpListings instead.
 */
export const AgentCatalogListingSchema = z
  .object({
    id: z.string().min(1).max(120),
    name: z.string().min(1).max(120),
    description: z.string().max(4_096).optional(),
    trustTier: AgentTrustTierSchema,
    version: z.string().min(1).max(64),
    homepage: z.string().url().max(2_048).optional(),
    iconUrl: z.string().min(1).max(2_048).optional(),
    dependsOn: CapabilityDependsOnSchema.optional(),
    roleLabel: z.string().trim().min(1).max(80).optional(),
    instructions: z.string().max(12_000).default(""),
    /** Skill ids to bind after install (project skill ids / catalog install ids). */
    skillIds: z.array(z.string().min(1).max(120)).max(64).default([]),
    permissionNotes: z.string().max(2000).optional(),
  })
  .strict();

export const AgentCatalogDocumentSchema = z
  .object({
    version: z.string().min(1).max(32),
    generatedAt: z.string().min(1).max(64).optional(),
    listings: z.array(AgentCatalogListingSchema).max(512),
  })
  .strict();

export const AgentCatalogReportSchema = z
  .object({
    listingId: z.string().min(1).max(120),
    reportedAt: z.string().min(1).max(64),
    note: z.string().max(1_024).optional(),
  })
  .strict();

export const AgentMarketplacePrefsSchema = z
  .object({
    catalogUrl: z.string().url().max(2_048).optional(),
    disabledListingIds: z.array(z.string().min(1).max(120)).max(512).optional(),
    reports: z.array(AgentCatalogReportSchema).max(512).optional(),
  })
  .strict();

export const AgentCatalogSourceKindSchema = z.enum([
  "remote",
  "cache",
  "bundled",
]);

export const AgentCatalogViewSchema = z
  .object({
    document: AgentCatalogDocumentSchema,
    source: AgentCatalogSourceKindSchema,
    fetchedAt: z.string().min(1).max(64),
    catalogUrl: z.string().max(2_048).optional(),
  })
  .strict();

export const InstallAgentFromCatalogInputSchema = z
  .object({
    listingId: z.string().min(1).max(120),
    replace: z.boolean().optional(),
  })
  .strict();

export const UninstallAgentFromCatalogInputSchema = z
  .object({
    listingId: z.string().min(1).max(120),
  })
  .strict();

export const ExportCapabilityPackInputSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("agent"),
      definitionId: z.string().min(1).max(200),
    })
    .strict(),
  z
    .object({
      kind: z.literal("workflow"),
      loopId: z.string().min(1).max(200),
    })
    .strict(),
  z
    .object({
      kind: z.literal("stencil"),
      stencilIds: z.array(z.string().min(1).max(64)).min(1).max(64),
      title: z.string().trim().min(1).max(120).optional(),
      description: z.string().max(4_096).optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("rules"),
      listingId: z.string().min(1).max(120),
    })
    .strict(),
]);

export const ExportCapabilityPackResultSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("agent"),
      listing: AgentCatalogListingSchema,
      /** JSON text suitable for clipboard / file share. */
      packJson: z.string().min(1).max(250_000),
    })
    .strict(),
  z
    .object({
      kind: z.literal("workflow"),
      listing: WorkflowCatalogListingSchema,
      packJson: z.string().min(1).max(250_000),
    })
    .strict(),
  z
    .object({
      kind: z.literal("stencil"),
      listing: StencilCatalogListingSchema,
      packJson: z.string().min(1).max(250_000),
    })
    .strict(),
  z
    .object({
      kind: z.literal("rules"),
      listing: RulesCatalogListingSchema,
      packJson: z.string().min(1).max(250_000),
    })
    .strict(),
]);

export const InstallAgentFromExportPackInputSchema = z
  .object({
    listing: AgentCatalogListingSchema,
    replace: z.boolean().optional(),
  })
  .strict();

export const InstallRulesFromExportPackInputSchema = z
  .object({
    listing: RulesCatalogListingSchema,
    replace: z.boolean().optional(),
  })
  .strict();

export const AGENT_CATALOG_REPORT_ISSUE_URL =
  "https://github.com/project-os/project-os/issues/new?labels=agent-catalog&title=Agent%20catalog%20report";

export const AGENT_CATALOG_DEFAULT_URL =
  "https://catalog.project-os.local/agents/catalog.json";

export type AgentTrustTier = z.infer<typeof AgentTrustTierSchema>;
export type AgentCatalogListing = z.infer<typeof AgentCatalogListingSchema>;
export type AgentCatalogDocument = z.infer<typeof AgentCatalogDocumentSchema>;
export type AgentCatalogReport = z.infer<typeof AgentCatalogReportSchema>;
export type AgentMarketplacePrefs = z.infer<typeof AgentMarketplacePrefsSchema>;
export type AgentCatalogSourceKind = z.infer<typeof AgentCatalogSourceKindSchema>;
export type AgentCatalogView = z.infer<typeof AgentCatalogViewSchema>;
export type InstallAgentFromCatalogInput = z.infer<
  typeof InstallAgentFromCatalogInputSchema
>;
export type UninstallAgentFromCatalogInput = z.infer<
  typeof UninstallAgentFromCatalogInputSchema
>;
export type ExportCapabilityPackInput = z.infer<typeof ExportCapabilityPackInputSchema>;
export type ExportCapabilityPackResult = z.infer<
  typeof ExportCapabilityPackResultSchema
>;
export type InstallAgentFromExportPackInput = z.infer<
  typeof InstallAgentFromExportPackInputSchema
>;
export type InstallRulesFromExportPackInput = z.infer<
  typeof InstallRulesFromExportPackInputSchema
>;
