import type {
  AgentCatalogDocument,
  AgentCatalogListing,
} from "../../contracts/agent-marketplace.js";

export {
  AgentCatalogClient,
  AgentCatalogClientError,
  AGENT_CATALOG_CACHE_TTL_MS,
  type AgentCatalogClientOptions,
} from "./client.js";
export {
  AgentCatalogDiskCache,
  defaultAgentCatalogCachePath,
  type AgentCatalogCacheRecord,
} from "./cache.js";
export {
  filterInstallableAgentListings,
  withDisabledAgentListing,
  withAgentCatalogReport,
  disabledAgentListingIdSet,
} from "./blocklist.js";
export {
  readBundledAgentCatalogBody,
  readBundledAgentCatalogPublicKey,
  readBundledAgentCatalogSignature,
} from "./bundled-assets.js";

export function findAgentCatalogListing(
  document: AgentCatalogDocument,
  listingId: string,
): AgentCatalogListing {
  const listing = document.listings.find((entry) => entry.id === listingId);
  if (!listing) {
    throw new Error(`Agent catalog listing '${listingId}' was not found`);
  }
  return listing;
}
