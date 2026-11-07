import { z } from "zod";

export const SkillTrustTierSchema = z.enum(["curated", "community"]);

export const SkillCatalogListingSchema = z
  .object({
    id: z.string().min(1).max(120),
    name: z.string().min(1).max(120),
    description: z.string().max(4_096).optional(),
    trustTier: SkillTrustTierSchema,
    version: z.string().min(1).max(64),
    homepage: z.string().url().max(2_048).optional(),
    /** Official publisher icon URL (https) or app-relative path. */
    iconUrl: z.string().min(1).max(2_048).optional(),
    /** Full SKILL.md contents (frontmatter + body). */
    skillMarkdown: z.string().min(1).max(200_000),
    /** Optional companion files relative to the skill directory. */
    files: z.record(z.string().max(200_000)).optional(),
  })
  .strict()
  .superRefine((listing, ctx) => {
    if (listing.files) {
      for (const rel of Object.keys(listing.files)) {
        if (
          !rel.trim() ||
          rel.includes("\0") ||
          rel.startsWith("/") ||
          rel.includes("..") ||
          rel.includes("\\")
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["files", rel],
            message: "companion file paths must be relative without ..",
          });
        }
      }
    }
  });

export const SkillCatalogDocumentSchema = z
  .object({
    version: z.string().min(1).max(32),
    generatedAt: z.string().min(1).max(64).optional(),
    listings: z.array(SkillCatalogListingSchema).max(512),
  })
  .strict();

export const SkillCatalogReportSchema = z
  .object({
    listingId: z.string().min(1).max(120),
    reportedAt: z.string().min(1).max(64),
    note: z.string().max(1_024).optional(),
  })
  .strict();

export const SkillMarketplacePrefsSchema = z
  .object({
    catalogUrl: z.string().url().max(2_048).optional(),
    disabledListingIds: z.array(z.string().min(1).max(120)).max(512).optional(),
    reports: z.array(SkillCatalogReportSchema).max(512).optional(),
  })
  .strict();

export const SkillCatalogSourceKindSchema = z.enum([
  "remote",
  "cache",
  "bundled",
]);

export const SkillCatalogViewSchema = z
  .object({
    document: SkillCatalogDocumentSchema,
    source: SkillCatalogSourceKindSchema,
    fetchedAt: z.string().min(1).max(64),
    catalogUrl: z.string().max(2_048).optional(),
  })
  .strict();

export const InstallSkillFromCatalogInputSchema = z
  .object({
    listingId: z.string().min(1).max(120),
    /** When true, overwrite an existing skill directory with the same id. */
    replace: z.boolean().optional(),
  })
  .strict();

export const UninstallSkillFromCatalogInputSchema = z
  .object({
    listingId: z.string().min(1).max(120),
  })
  .strict();

export const SKILL_CATALOG_REPORT_ISSUE_URL =
  "https://github.com/project-os/project-os/issues/new?labels=skill-catalog&title=Skill%20catalog%20report";

export const SKILL_CATALOG_DEFAULT_URL =
  "https://catalog.project-os.local/skills/catalog.json";

export type SkillTrustTier = z.infer<typeof SkillTrustTierSchema>;
export type SkillCatalogListing = z.infer<typeof SkillCatalogListingSchema>;
export type SkillCatalogDocument = z.infer<typeof SkillCatalogDocumentSchema>;
export type SkillCatalogReport = z.infer<typeof SkillCatalogReportSchema>;
export type SkillMarketplacePrefs = z.infer<typeof SkillMarketplacePrefsSchema>;
export type SkillCatalogSourceKind = z.infer<typeof SkillCatalogSourceKindSchema>;
export type SkillCatalogView = z.infer<typeof SkillCatalogViewSchema>;
export type InstallSkillFromCatalogInput = z.infer<
  typeof InstallSkillFromCatalogInputSchema
>;
export type UninstallSkillFromCatalogInput = z.infer<
  typeof UninstallSkillFromCatalogInputSchema
>;
