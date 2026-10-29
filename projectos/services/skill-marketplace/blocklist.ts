import type {
  SkillCatalogDocument,
  SkillCatalogListing,
  SkillCatalogReport,
  SkillMarketplacePrefs,
} from "../../contracts/skill-marketplace.js";

export function disabledSkillListingIdSet(
  prefs: SkillMarketplacePrefs | undefined,
): Set<string> {
  return new Set(prefs?.disabledListingIds ?? []);
}

export function filterInstallableSkillListings(
  document: SkillCatalogDocument,
  prefs: SkillMarketplacePrefs | undefined,
): SkillCatalogListing[] {
  const disabled = disabledSkillListingIdSet(prefs);
  return document.listings.filter((listing) => !disabled.has(listing.id));
}

export function withDisabledSkillListing(
  prefs: SkillMarketplacePrefs | undefined,
  listingId: string,
): SkillMarketplacePrefs {
  const existing = new Set(prefs?.disabledListingIds ?? []);
  existing.add(listingId);
  return {
    ...(prefs ?? {}),
    disabledListingIds: [...existing],
  };
}

export function withSkillCatalogReport(
  prefs: SkillMarketplacePrefs | undefined,
  report: SkillCatalogReport,
): SkillMarketplacePrefs {
  const reports = [...(prefs?.reports ?? []), report].slice(-512);
  const withDisable = withDisabledSkillListing(prefs, report.listingId);
  return {
    ...withDisable,
    reports,
  };
}
