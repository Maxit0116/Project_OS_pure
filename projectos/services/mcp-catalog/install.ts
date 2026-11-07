import type {
  McpCatalogDocument,
  McpCatalogListing,
  InstallMcpFromCatalogInput,
} from "../../contracts/mcp-catalog.js";
import type { McpServerConfig } from "../../contracts/settings.js";

export class McpCatalogInstallError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "McpCatalogInstallError";
  }
}

export function findCatalogListing(
  document: McpCatalogDocument,
  listingId: string,
): McpCatalogListing {
  const listing = document.listings.find((entry) => entry.id === listingId);
  if (!listing) {
    throw new McpCatalogInstallError(`Catalog listing '${listingId}' was not found`);
  }
  return listing;
}

export function createServerIdFromListing(listingId: string): string {
  const slug = listingId
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "_")
    .replace(/^_+|_+$/gu, "")
    .slice(0, 48);
  const suffix = Math.random().toString(36).slice(2, 6);
  return `mcp_${slug || "listing"}_${suffix}`.slice(0, 80);
}

/** Map a catalog listing to a disabled-by-default MCP server config. */
export function listingToMcpServerConfig(input: {
  listing: McpCatalogListing;
  catalogVersion: string;
  serverId?: string;
  overrides?: Pick<InstallMcpFromCatalogInput, "cwd" | "enabled">;
  installedAt?: string;
}): McpServerConfig {
  const { listing, catalogVersion } = input;
  const community = listing.trustTier === "community";
  const wantEnabled = input.overrides?.enabled === true;
  const enabled = community ? false : wantEnabled ? true : false;

  const provenance = {
    listingId: listing.id,
    catalogVersion,
    trustTier: listing.trustTier,
    listingVersion: listing.version,
    installedAt: input.installedAt ?? new Date().toISOString(),
    source: "catalog" as const,
  };

  const base = {
    id: input.serverId ?? createServerIdFromListing(listing.id),
    name: listing.name,
    enabled,
    transport: listing.transport,
    provenance,
    ...(listing.toolAllowlist ? { toolAllowlist: listing.toolAllowlist } : {}),
  };

  if (listing.transport === "stdio") {
    return {
      ...base,
      transport: "stdio",
      command: listing.command!,
      ...(listing.args?.length ? { args: listing.args } : {}),
      ...(listing.env ? { env: listing.env } : {}),
      ...((input.overrides?.cwd ?? listing.cwd)
        ? { cwd: input.overrides?.cwd ?? listing.cwd }
        : {}),
    };
  }

  return {
    ...base,
    transport: "http",
    url: listing.url!,
    ...(listing.headers ? { headers: listing.headers } : {}),
  };
}
