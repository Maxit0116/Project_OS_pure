import type {
  RulesCatalogDocument,
  RulesCatalogListing,
} from "../../contracts/rules-marketplace.js";

export {
  RulesCatalogClient,
  RulesCatalogClientError,
  RULES_CATALOG_CACHE_TTL_MS,
  type RulesCatalogClientOptions,
} from "./client.js";
export {
  RulesCatalogDiskCache,
  defaultRulesCatalogCachePath,
  type RulesCatalogCacheRecord,
} from "./cache.js";
export {
  filterInstallableRulesListings,
  withDisabledRulesListing,
  withRulesCatalogReport,
  disabledRulesListingIdSet,
} from "./blocklist.js";
export {
  readBundledRulesCatalogBody,
  readBundledRulesCatalogPublicKey,
  readBundledRulesCatalogSignature,
} from "./bundled-assets.js";

export function findRulesCatalogListing(
  document: RulesCatalogDocument,
  listingId: string,
): RulesCatalogListing {
  const listing = document.listings.find((entry) => entry.id === listingId);
  if (!listing) {
    throw new Error(`Rules catalog listing '${listingId}' was not found`);
  }
  return listing;
}
