import { z } from "zod";

import {
  CapabilityDependsOnSchema,
  CapabilityTrustTierSchema,
} from "./capability-marketplace.js";
import { IntentGraphSchema } from "./loop-graph.js";
import { LoopGraphPresetSchema } from "./loop-presets.js";

export const WorkflowTrustTierSchema = CapabilityTrustTierSchema;

/**
 * Catalog / export shape for a Loop IntentGraph workflow pack.
 * Draft must parse as IntentGraph; authoringSessionId / agentDefinitionId are stripped on export.
 */
export const WorkflowCatalogListingSchema = z
  .object({
    id: z.string().min(1).max(120),
    name: z.string().min(1).max(120),
    description: z.string().max(4_096).optional(),
    trustTier: WorkflowTrustTierSchema,
    version: z.string().min(1).max(64),
    homepage: z.string().url().max(2_048).optional(),
    iconUrl: z.string().min(1).max(2_048).optional(),
    dependsOn: CapabilityDependsOnSchema.optional(),
    draft: IntentGraphSchema,
  })
  .strict();

export const WorkflowCatalogDocumentSchema = z
  .object({
    version: z.string().min(1).max(32),
    generatedAt: z.string().min(1).max(64).optional(),
    listings: z.array(WorkflowCatalogListingSchema).max(512),
  })
  .strict();

export const WorkflowCatalogReportSchema = z
  .object({
    listingId: z.string().min(1).max(120),
    reportedAt: z.string().min(1).max(64),
    note: z.string().max(1_024).optional(),
  })
  .strict();

export const WorkflowMarketplacePrefsSchema = z
  .object({
    catalogUrl: z.string().url().max(2_048).optional(),
    disabledListingIds: z.array(z.string().min(1).max(120)).max(512).optional(),
    reports: z.array(WorkflowCatalogReportSchema).max(512).optional(),
  })
  .strict();

export const WorkflowCatalogSourceKindSchema = z.enum([
  "remote",
  "cache",
  "bundled",
]);

export const WorkflowCatalogViewSchema = z
  .object({
    document: WorkflowCatalogDocumentSchema,
    source: WorkflowCatalogSourceKindSchema,
    fetchedAt: z.string().min(1).max(64),
    catalogUrl: z.string().max(2_048).optional(),
  })
  .strict();

export const InstallWorkflowFromCatalogInputSchema = z
  .object({
    listingId: z.string().min(1).max(120),
    replace: z.boolean().optional(),
  })
  .strict();

export const UninstallWorkflowFromCatalogInputSchema = z
  .object({
    listingId: z.string().min(1).max(120),
  })
  .strict();

export const InstallWorkflowFromExportPackInputSchema = z
  .object({
    listing: WorkflowCatalogListingSchema,
    replace: z.boolean().optional(),
  })
  .strict();

/** On-disk user preset under `.projectos/loop-presets/<id>.json`. */
export const UserLoopPresetFileSchema = z
  .object({
    preset: LoopGraphPresetSchema,
    provenance: z
      .object({
        listingId: z.string().min(1).max(120),
        catalogVersion: z.string().min(1).max(32),
        trustTier: WorkflowTrustTierSchema,
        listingVersion: z.string().min(1).max(64),
        installedAt: z.string().min(1).max(64),
        source: z
          .enum(["catalog", "manual", "git-url", "export-reimport"])
          .default("catalog"),
        kind: z.literal("workflow"),
      })
      .strict()
      .optional(),
  })
  .strict();

export const WORKFLOW_CATALOG_REPORT_ISSUE_URL =
  "https://github.com/project-os/project-os/issues/new?labels=workflow-catalog&title=Workflow%20catalog%20report";

export const WORKFLOW_CATALOG_DEFAULT_URL =
  "https://catalog.project-os.local/workflows/catalog.json";

export type WorkflowTrustTier = z.infer<typeof WorkflowTrustTierSchema>;
export type WorkflowCatalogListing = z.infer<typeof WorkflowCatalogListingSchema>;
export type WorkflowCatalogDocument = z.infer<typeof WorkflowCatalogDocumentSchema>;
export type WorkflowCatalogReport = z.infer<typeof WorkflowCatalogReportSchema>;
export type WorkflowMarketplacePrefs = z.infer<typeof WorkflowMarketplacePrefsSchema>;
export type WorkflowCatalogSourceKind = z.infer<
  typeof WorkflowCatalogSourceKindSchema
>;
export type WorkflowCatalogView = z.infer<typeof WorkflowCatalogViewSchema>;
export type InstallWorkflowFromCatalogInput = z.infer<
  typeof InstallWorkflowFromCatalogInputSchema
>;
export type UninstallWorkflowFromCatalogInput = z.infer<
  typeof UninstallWorkflowFromCatalogInputSchema
>;
export type InstallWorkflowFromExportPackInput = z.infer<
  typeof InstallWorkflowFromExportPackInputSchema
>;
export type UserLoopPresetFile = z.infer<typeof UserLoopPresetFileSchema>;
