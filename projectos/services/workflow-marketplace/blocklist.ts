import type {
  WorkflowCatalogDocument,
  WorkflowCatalogListing,
  WorkflowCatalogReport,
  WorkflowMarketplacePrefs,
} from "../../contracts/workflow-marketplace.js";

export function disabledWorkflowListingIdSet(
  prefs: WorkflowMarketplacePrefs | undefined,
): Set<string> {
  return new Set(prefs?.disabledListingIds ?? []);
}

export function filterInstallableWorkflowListings(
  document: WorkflowCatalogDocument,
  _prefs: WorkflowMarketplacePrefs | undefined,
): WorkflowCatalogListing[] {
  // Hide/disable is retired — catalog listings stay visible.
  void _prefs;
  return document.listings;
}

export function withDisabledWorkflowListing(
  prefs: WorkflowMarketplacePrefs | undefined,
  listingId: string,
): WorkflowMarketplacePrefs {
  const existing = new Set(prefs?.disabledListingIds ?? []);
  existing.add(listingId);
  return {
    ...(prefs ?? {}),
    disabledListingIds: [...existing],
  };
}

export function withWorkflowCatalogReport(
  prefs: WorkflowMarketplacePrefs | undefined,
  report: WorkflowCatalogReport,
): WorkflowMarketplacePrefs {
  const reports = [...(prefs?.reports ?? []), report].slice(-512);
  const withDisable = withDisabledWorkflowListing(prefs, report.listingId);
  return {
    ...withDisable,
    reports,
  };
}
