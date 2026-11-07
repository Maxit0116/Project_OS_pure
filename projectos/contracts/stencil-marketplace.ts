import { z } from "zod";

import {
  CapabilityDependsOnSchema,
  CapabilityTrustTierSchema,
} from "./capability-marketplace.js";
import { StencilDefinitionSchema } from "./ui-stencil.js";

export const StencilTrustTierSchema = CapabilityTrustTierSchema;

/**
 * Catalog / export shape for a UI Stencil pack.
 * One listing may ship multiple StencilDefinition entries (Share selected…).
 * licenseNote on each stencil is preserved for Commons Clause / MIT attribution.
 */
export const StencilCatalogListingSchema = z
  .object({
    id: z.string().min(1).max(120),
    name: z.string().min(1).max(120),
    description: z.string().max(4_096).optional(),
    trustTier: StencilTrustTierSchema,
    version: z.string().min(1).max(64),
    homepage: z.string().url().max(2_048).optional(),
    iconUrl: z.string().min(1).max(2_048).optional(),
    dependsOn: CapabilityDependsOnSchema.optional(),
    stencils: z.array(StencilDefinitionSchema).min(1).max(64),
  })
  .strict();

export const StencilCatalogDocumentSchema = z
  .object({
    version: z.string().min(1).max(32),
    generatedAt: z.string().min(1).max(64).optional(),
    listings: z.array(StencilCatalogListingSchema).max(512),
  })
  .strict();

export const StencilCatalogReportSchema = z
  .object({
    listingId: z.string().min(1).max(120),
    reportedAt: z.string().min(1).max(64),
    note: z.string().max(1_024).optional(),
  })
  .strict();

export const StencilMarketplacePrefsSchema = z
  .object({
    catalogUrl: z.string().url().max(2_048).optional(),
    disabledListingIds: z.array(z.string().min(1).max(120)).max(512).optional(),
    reports: z.array(StencilCatalogReportSchema).max(512).optional(),
  })
  .strict();

export const StencilCatalogSourceKindSchema = z.enum([
  "remote",
  "cache",
  "bundled",
]);

export const StencilCatalogViewSchema = z
  .object({
    document: StencilCatalogDocumentSchema,
    source: StencilCatalogSourceKindSchema,
    fetchedAt: z.string().min(1).max(64),
    catalogUrl: z.string().max(2_048).optional(),
  })
  .strict();

export const InstallStencilFromCatalogInputSchema = z
  .object({
    listingId: z.string().min(1).max(120),
    replace: z.boolean().optional(),
  })
  .strict();

export const UninstallStencilFromCatalogInputSchema = z
  .object({
    listingId: z.string().min(1).max(120),
  })
  .strict();

export const InstallStencilFromExportPackInputSchema = z
  .object({
    listing: StencilCatalogListingSchema,
    replace: z.boolean().optional(),
  })
  .strict();

/** On-disk user pack under `.projectos/stencils/<id>.json`. */
export const UserStencilPackFileSchema = z
  .object({
    listingId: z.string().min(1).max(120),
    stencils: z.array(StencilDefinitionSchema).min(1).max(64),
    provenance: z
      .object({
        listingId: z.string().min(1).max(120),
        catalogVersion: z.string().min(1).max(32),
        trustTier: StencilTrustTierSchema,
        listingVersion: z.string().min(1).max(64),
        installedAt: z.string().min(1).max(64),
        source: z
          .enum(["catalog", "manual", "git-url", "export-reimport"])
          .default("catalog"),
        kind: z.literal("stencil"),
      })
      .strict()
      .optional(),
  })
  .strict();

export const STENCIL_CATALOG_REPORT_ISSUE_URL =
  "https://github.com/project-os/project-os/issues/new?labels=stencil-catalog&title=Stencil%20catalog%20report";

export const STENCIL_CATALOG_DEFAULT_URL =
  "https://catalog.project-os.local/stencils/catalog.json";

export type StencilTrustTier = z.infer<typeof StencilTrustTierSchema>;
export type StencilCatalogListing = z.infer<typeof StencilCatalogListingSchema>;
export type StencilCatalogDocument = z.infer<typeof StencilCatalogDocumentSchema>;
export type StencilCatalogReport = z.infer<typeof StencilCatalogReportSchema>;
export type StencilMarketplacePrefs = z.infer<typeof StencilMarketplacePrefsSchema>;
export type StencilCatalogSourceKind = z.infer<
  typeof StencilCatalogSourceKindSchema
>;
export type StencilCatalogView = z.infer<typeof StencilCatalogViewSchema>;
export type InstallStencilFromCatalogInput = z.infer<
  typeof InstallStencilFromCatalogInputSchema
>;
export type UninstallStencilFromCatalogInput = z.infer<
  typeof UninstallStencilFromCatalogInputSchema
>;
export type InstallStencilFromExportPackInput = z.infer<
  typeof InstallStencilFromExportPackInputSchema
>;
export type UserStencilPackFile = z.infer<typeof UserStencilPackFileSchema>;
