import type {
  SkillCatalogDocument,
  SkillCatalogListing,
} from "../../contracts/skill-marketplace.js";

export {
  SkillCatalogClient,
  SkillCatalogClientError,
  SKILL_CATALOG_CACHE_TTL_MS,
  type SkillCatalogClientOptions,
} from "./client.js";
export {
  SkillCatalogDiskCache,
  defaultSkillCatalogCachePath,
  type SkillCatalogCacheRecord,
} from "./cache.js";
export {
  filterInstallableSkillListings,
  withDisabledSkillListing,
  withSkillCatalogReport,
  disabledSkillListingIdSet,
} from "./blocklist.js";

export function findSkillCatalogListing(
  document: SkillCatalogDocument,
  listingId: string,
): SkillCatalogListing {
  const listing = document.listings.find((entry) => entry.id === listingId);
  if (!listing) {
    throw new Error(`Skill catalog listing '${listingId}' was not found`);
  }
  return listing;
}
