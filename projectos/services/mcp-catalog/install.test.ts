import { describe, expect, it } from "vitest";

import { listingToMcpServerConfig } from "./install.js";
import type { McpCatalogListing } from "../../contracts/mcp-catalog.js";

const curatedStdio: McpCatalogListing = {
  id: "curated.demo",
  name: "Demo",
  trustTier: "curated",
  version: "1.0.0",
  requiresAuth: false,
  transport: "stdio",
  command: "npx",
  args: ["-y", "demo"],
};

const communityStdio: McpCatalogListing = {
  ...curatedStdio,
  id: "community.demo",
  trustTier: "community",
};

describe("listingToMcpServerConfig", () => {
  it("defaults curated installs to disabled", () => {
    const config = listingToMcpServerConfig({
      listing: curatedStdio,
      catalogVersion: "1",
      serverId: "mcp_demo",
      installedAt: "2026-10-29T00:00:00.000Z",
    });
    expect(config.enabled).toBe(false);
    expect(config.provenance).toEqual({
      listingId: "curated.demo",
      catalogVersion: "1",
      trustTier: "curated",
      listingVersion: "1.0.0",
      installedAt: "2026-10-29T00:00:00.000Z",
      source: "catalog",
    });
  });

  it("forces community installs to stay disabled even when enabled is requested", () => {
    const config = listingToMcpServerConfig({
      listing: communityStdio,
      catalogVersion: "1",
      serverId: "mcp_community",
      overrides: { enabled: true },
    });
    expect(config.enabled).toBe(false);
    expect(config.provenance?.trustTier).toBe("community");
  });
});
