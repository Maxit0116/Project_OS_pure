import type {
  StencilCatalogDocument,
  StencilCatalogListing,
  StencilCatalogReport,
  StencilMarketplacePrefs,
} from "../../contracts/stencil-marketplace.js";

export function disabledStencilListingIdSet(
  prefs: StencilMarketplacePrefs | undefined,
): Set<string> {
  return new Set(prefs?.disabledListingIds ?? []);
}

export function filterInstallableStencilListings(
  document: StencilCatalogDocument,
  _prefs: StencilMarketplacePrefs | undefined,
): StencilCatalogListing[] {
  // Hide/disable is retired — catalog listings stay visible.
  void _prefs;
  return document.listings;
}

export function withDisabledStencilListing(
  prefs: StencilMarketplacePrefs | undefined,
  listingId: string,
): StencilMarketplacePrefs {
  const existing = new Set(prefs?.disabledListingIds ?? []);
  existing.add(listingId);
  return {
    ...(prefs ?? {}),
    disabledListingIds: [...existing],
  };
}

export function withStencilCatalogReport(
  prefs: StencilMarketplacePrefs | undefined,
  report: StencilCatalogReport,
): StencilMarketplacePrefs {
  const reports = [...(prefs?.reports ?? []), report].slice(-512);
  const withDisable = withDisabledStencilListing(prefs, report.listingId);
  return {
    ...withDisable,
    reports,
  };
}
