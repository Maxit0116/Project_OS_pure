import type {
  StencilCatalogDocument,
  StencilCatalogListing,
} from "../../contracts/stencil-marketplace.js";

export {
  StencilCatalogClient,
  StencilCatalogClientError,
  STENCIL_CATALOG_CACHE_TTL_MS,
  type StencilCatalogClientOptions,
} from "./client.js";
export {
  StencilCatalogDiskCache,
  defaultStencilCatalogCachePath,
  type StencilCatalogCacheRecord,
} from "./cache.js";
export {
  filterInstallableStencilListings,
  withDisabledStencilListing,
  withStencilCatalogReport,
  disabledStencilListingIdSet,
} from "./blocklist.js";
export {
  readBundledStencilCatalogBody,
  readBundledStencilCatalogPublicKey,
  readBundledStencilCatalogSignature,
} from "./bundled-assets.js";

export function findStencilCatalogListing(
  document: StencilCatalogDocument,
  listingId: string,
): StencilCatalogListing {
  const listing = document.listings.find((entry) => entry.id === listingId);
  if (!listing) {
    throw new Error(`Stencil catalog listing '${listingId}' was not found`);
  }
  return listing;
}
