import type {
  McpCatalogDocument,
  McpCatalogListing,
  McpCatalogReport,
  McpMarketplacePrefs,
} from "../../contracts/mcp-catalog.js";

export function disabledListingIdSet(
  prefs: McpMarketplacePrefs | undefined,
): Set<string> {
  return new Set(prefs?.disabledListingIds ?? []);
}

export function filterInstallableListings(
  document: McpCatalogDocument,
  prefs: McpMarketplacePrefs | undefined,
): McpCatalogListing[] {
  const disabled = disabledListingIdSet(prefs);
  return document.listings.filter((listing) => !disabled.has(listing.id));
}

export function withDisabledListing(
  prefs: McpMarketplacePrefs | undefined,
  listingId: string,
): McpMarketplacePrefs {
  const existing = new Set(prefs?.disabledListingIds ?? []);
  existing.add(listingId);
  return {
    ...(prefs ?? {}),
    disabledListingIds: [...existing],
  };
}

export function withCatalogReport(
  prefs: McpMarketplacePrefs | undefined,
  report: McpCatalogReport,
): McpMarketplacePrefs {
  const reports = [...(prefs?.reports ?? []), report].slice(-512);
  const withDisable = withDisabledListing(prefs, report.listingId);
  return {
    ...withDisable,
    reports,
  };
}
