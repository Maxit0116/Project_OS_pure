import type {
  AgentCatalogDocument,
  AgentCatalogListing,
  AgentCatalogReport,
  AgentMarketplacePrefs,
} from "../../contracts/agent-marketplace.js";

export function disabledAgentListingIdSet(
  prefs: AgentMarketplacePrefs | undefined,
): Set<string> {
  return new Set(prefs?.disabledListingIds ?? []);
}

export function filterInstallableAgentListings(
  document: AgentCatalogDocument,
  prefs: AgentMarketplacePrefs | undefined,
): AgentCatalogListing[] {
  const disabled = disabledAgentListingIdSet(prefs);
  return document.listings.filter((listing) => !disabled.has(listing.id));
}

export function withDisabledAgentListing(
  prefs: AgentMarketplacePrefs | undefined,
  listingId: string,
): AgentMarketplacePrefs {
  const existing = new Set(prefs?.disabledListingIds ?? []);
  existing.add(listingId);
  return {
    ...(prefs ?? {}),
    disabledListingIds: [...existing],
  };
}

export function withAgentCatalogReport(
  prefs: AgentMarketplacePrefs | undefined,
  report: AgentCatalogReport,
): AgentMarketplacePrefs {
  const reports = [...(prefs?.reports ?? []), report].slice(-512);
  const withDisable = withDisabledAgentListing(prefs, report.listingId);
  return {
    ...withDisable,
    reports,
  };
}
