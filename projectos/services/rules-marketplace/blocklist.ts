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
  prefs: RulesMarketplacePrefs | undefined,
): RulesCatalogListing[] {
  const disabled = disabledRulesListingIdSet(prefs);
  return document.listings.filter((listing) => !disabled.has(listing.id));
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
