import type {
  WorkflowCatalogDocument,
  WorkflowCatalogListing,
} from "../../contracts/workflow-marketplace.js";

export {
  WorkflowCatalogClient,
  WorkflowCatalogClientError,
  WORKFLOW_CATALOG_CACHE_TTL_MS,
  type WorkflowCatalogClientOptions,
} from "./client.js";
export {
  WorkflowCatalogDiskCache,
  defaultWorkflowCatalogCachePath,
  type WorkflowCatalogCacheRecord,
} from "./cache.js";
export {
  filterInstallableWorkflowListings,
  withDisabledWorkflowListing,
  withWorkflowCatalogReport,
  disabledWorkflowListingIdSet,
} from "./blocklist.js";
export {
  readBundledWorkflowCatalogBody,
  readBundledWorkflowCatalogPublicKey,
  readBundledWorkflowCatalogSignature,
} from "./bundled-assets.js";

export function findWorkflowCatalogListing(
  document: WorkflowCatalogDocument,
  listingId: string,
): WorkflowCatalogListing {
  const listing = document.listings.find((entry) => entry.id === listingId);
  if (!listing) {
    throw new Error(`Workflow catalog listing '${listingId}' was not found`);
  }
  return listing;
}
