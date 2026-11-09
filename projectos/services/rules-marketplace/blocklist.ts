import type {
  RulesCatalogDocument,
  RulesCatalogListing,
  RulesCatalogReport,
  RulesMarketplacePrefs,
} from "../../contracts/rules-marketplace.js";

export function disabledRulesListingIdSet(
  prefs: RulesMarketplacePrefs | undefined,
): Set<string> {
  return new Set(prefs?.disabledListingIds ?? []);
}

export function filterInstallableRulesListings(
  document: RulesCatalogDocument,
  _prefs: RulesMarketplacePrefs | undefined,
): RulesCatalogListing[] {
  // Hide/disable is retired — catalog listings stay visible.
  void _prefs;
  return document.listings;
}

export function withDisabledRulesListing(
  prefs: RulesMarketplacePrefs | undefined,
  listingId: string,
): RulesMarketplacePrefs {
  const existing = new Set(prefs?.disabledListingIds ?? []);
  existing.add(listingId);
  return {
    ...(prefs ?? {}),
    disabledListingIds: [...existing],
  };
}

export function withRulesCatalogReport(
  prefs: RulesMarketplacePrefs | undefined,
  report: RulesCatalogReport,
): RulesMarketplacePrefs {
  const reports = [...(prefs?.reports ?? []), report].slice(-512);
  const withDisable = withDisabledRulesListing(prefs, report.listingId);
  return {
    ...withDisable,
    reports,
  };
}
