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
  _prefs: McpMarketplacePrefs | undefined,
): McpCatalogListing[] {
  // Hide/disable is retired — catalog listings stay visible.
  void _prefs;
  return document.listings;
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
