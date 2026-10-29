import { z } from "zod";

/** Mirrors settings.McpTransportSchema to avoid a circular import. */
const CatalogTransportSchema = z.enum(["stdio", "http"]);

export const McpTrustTierSchema = z.enum(["curated", "community"]);

export const McpCatalogListingSchema = z
  .object({
    id: z.string().min(1).max(120),
    name: z.string().min(1).max(120),
    description: z.string().max(4_096).optional(),
    trustTier: McpTrustTierSchema,
    version: z.string().min(1).max(64),
    homepage: z.string().url().max(2_048).optional(),
    /** Official publisher icon URL (https) or app-relative path. */
    iconUrl: z.string().min(1).max(2_048).optional(),
    requiresAuth: z.boolean().default(false),
    transport: CatalogTransportSchema,
    command: z.string().min(1).max(512).optional(),
    args: z.array(z.string().max(512)).max(64).optional(),
    env: z.record(z.string().max(4_096)).optional(),
    cwd: z.string().min(1).max(1_024).optional(),
    url: z.string().min(1).max(2_048).optional(),
    headers: z.record(z.string().max(2_048)).optional(),
    toolAllowlist: z.array(z.string().min(1).max(200)).max(256).optional(),
  })
  .strict()
  .superRefine((listing, ctx) => {
    if (listing.transport === "stdio") {
      if (!listing.command?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["command"],
          message: "stdio catalog listings require a command",
        });
      }
    } else if (!listing.url?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["url"],
        message: "http catalog listings require a url",
      });
    }
  });

export const McpCatalogDocumentSchema = z
  .object({
    version: z.string().min(1).max(32),
    generatedAt: z.string().min(1).max(64).optional(),
    listings: z.array(McpCatalogListingSchema).max(512),
  })
  .strict();

export const McpServerProvenanceSchema = z
  .object({
    listingId: z.string().min(1).max(120),
    catalogVersion: z.string().min(1).max(32),
    trustTier: McpTrustTierSchema,
    listingVersion: z.string().min(1).max(64),
    installedAt: z.string().min(1).max(64),
    source: z.enum(["catalog", "manual"]).default("catalog"),
  })
  .strict();

export const McpCatalogReportSchema = z
  .object({
    listingId: z.string().min(1).max(120),
    reportedAt: z.string().min(1).max(64),
    note: z.string().max(1_024).optional(),
  })
  .strict();

export const McpMarketplacePrefsSchema = z
  .object({
    catalogUrl: z.string().url().max(2_048).optional(),
    disabledListingIds: z.array(z.string().min(1).max(120)).max(512).optional(),
    reports: z.array(McpCatalogReportSchema).max(512).optional(),
  })
  .strict();

export const McpCatalogSourceKindSchema = z.enum([
  "remote",
  "cache",
  "bundled",
]);

export const McpCatalogViewSchema = z
  .object({
    document: McpCatalogDocumentSchema,
    source: McpCatalogSourceKindSchema,
    fetchedAt: z.string().min(1).max(64),
    catalogUrl: z.string().max(2_048).optional(),
  })
  .strict();

export const InstallMcpFromCatalogInputSchema = z
  .object({
    listingId: z.string().min(1).max(120),
    authToken: z.string().max(8_192).optional(),
    /** Optional overrides applied after listing template (cwd only for stdio). */
    cwd: z.string().min(1).max(1_024).optional(),
    /** Force-enable after install. Community listings ignore true and stay disabled. */
    enabled: z.boolean().optional(),
  })
  .strict();

/** Placeholder issue URL opened when reporting a listing (no upload backend). */
export const MCP_CATALOG_REPORT_ISSUE_URL =
  "https://github.com/project-os/project-os/issues/new?labels=mcp-catalog&title=MCP%20catalog%20report";

/** Default remote catalog URL (overridable via mcpMarketplace.catalogUrl). */
export const MCP_CATALOG_DEFAULT_URL =
  "https://catalog.project-os.local/mcp/catalog.json";

export type McpTrustTier = z.infer<typeof McpTrustTierSchema>;
export type McpCatalogListing = z.infer<typeof McpCatalogListingSchema>;
export type McpCatalogDocument = z.infer<typeof McpCatalogDocumentSchema>;
export type McpServerProvenance = z.infer<typeof McpServerProvenanceSchema>;
export type McpCatalogReport = z.infer<typeof McpCatalogReportSchema>;
export type McpMarketplacePrefs = z.infer<typeof McpMarketplacePrefsSchema>;
export type McpCatalogSourceKind = z.infer<typeof McpCatalogSourceKindSchema>;
export type McpCatalogView = z.infer<typeof McpCatalogViewSchema>;
export type InstallMcpFromCatalogInput = z.infer<
  typeof InstallMcpFromCatalogInputSchema
>;
