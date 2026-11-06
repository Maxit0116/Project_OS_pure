import { z } from "zod";

import {
  CapabilityDependsOnSchema,
  CapabilityTrustTierSchema,
} from "./capability-marketplace.js";

export const RulesTrustTierSchema = CapabilityTrustTierSchema;

export const RulesCatalogListingSchema = z
  .object({
    id: z.string().min(1).max(120),
    name: z.string().min(1).max(120),
    description: z.string().max(4_096).optional(),
    trustTier: RulesTrustTierSchema,
    version: z.string().min(1).max(64),
    homepage: z.string().url().max(2_048).optional(),
    iconUrl: z.string().min(1).max(2_048).optional(),
    dependsOn: CapabilityDependsOnSchema.optional(),
    /**
     * Markdown files relative to the pack root (under `.projectos/rules/<packId>/`).
     * Keys must be relative without `..`.
     */
    files: z.record(z.string().max(200_000)).refine(
      (files) => Object.keys(files).length >= 1,
      { message: "rules pack requires at least one markdown file" },
    ),
  })
  .strict()
  .superRefine((listing, ctx) => {
    for (const rel of Object.keys(listing.files)) {
      if (
        !rel.trim() ||
        rel.includes("\0") ||
        rel.startsWith("/") ||
        rel.includes("..") ||
        rel.includes("\\") ||
        !/\.md$/iu.test(rel)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["files", rel],
          message: "rules file paths must be relative .md without ..",
        });
      }
    }
  });

export const RulesCatalogDocumentSchema = z
  .object({
    version: z.string().min(1).max(32),
    generatedAt: z.string().min(1).max(64).optional(),
    listings: z.array(RulesCatalogListingSchema).max(512),
  })
  .strict();

export const RulesCatalogReportSchema = z
  .object({
    listingId: z.string().min(1).max(120),
    reportedAt: z.string().min(1).max(64),
    note: z.string().max(1_024).optional(),
  })
  .strict();

export const RulesMarketplacePrefsSchema = z
  .object({
    catalogUrl: z.string().url().max(2_048).optional(),
    disabledListingIds: z.array(z.string().min(1).max(120)).max(512).optional(),
    reports: z.array(RulesCatalogReportSchema).max(512).optional(),
  })
  .strict();

export const RulesCatalogSourceKindSchema = z.enum([
  "remote",
  "cache",
  "bundled",
]);

export const RulesCatalogViewSchema = z
  .object({
    document: RulesCatalogDocumentSchema,
    source: RulesCatalogSourceKindSchema,
    fetchedAt: z.string().min(1).max(64),
    catalogUrl: z.string().max(2_048).optional(),
  })
  .strict();

export const InstallRulesFromCatalogInputSchema = z
  .object({
    listingId: z.string().min(1).max(120),
    replace: z.boolean().optional(),
  })
  .strict();

export const UninstallRulesFromCatalogInputSchema = z
  .object({
    listingId: z.string().min(1).max(120),
  })
  .strict();

export const RULES_CATALOG_REPORT_ISSUE_URL =
  "https://github.com/project-os/project-os/issues/new?labels=rules-catalog&title=Rules%20catalog%20report";

export const RULES_CATALOG_DEFAULT_URL =
  "https://catalog.project-os.local/rules/catalog.json";

/** Written beside installed pack files for provenance + safe uninstall. */
export const RULES_PACK_MANIFEST_FILE = ".projectos-pack.json";

export type RulesTrustTier = z.infer<typeof RulesTrustTierSchema>;
export type RulesCatalogListing = z.infer<typeof RulesCatalogListingSchema>;
export type RulesCatalogDocument = z.infer<typeof RulesCatalogDocumentSchema>;
export type RulesCatalogReport = z.infer<typeof RulesCatalogReportSchema>;
export type RulesMarketplacePrefs = z.infer<typeof RulesMarketplacePrefsSchema>;
export type RulesCatalogSourceKind = z.infer<typeof RulesCatalogSourceKindSchema>;
export type RulesCatalogView = z.infer<typeof RulesCatalogViewSchema>;
export type InstallRulesFromCatalogInput = z.infer<
  typeof InstallRulesFromCatalogInputSchema
>;
export type UninstallRulesFromCatalogInput = z.infer<
  typeof UninstallRulesFromCatalogInputSchema
>;
