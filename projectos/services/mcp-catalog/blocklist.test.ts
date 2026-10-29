import { describe, expect, it } from "vitest";

import {
  filterInstallableListings,
  withCatalogReport,
  withDisabledListing,
} from "./blocklist.js";
import type { McpCatalogDocument } from "../../contracts/mcp-catalog.js";

const document: McpCatalogDocument = {
  version: "1",
  listings: [
    {
      id: "a",
      name: "A",
      trustTier: "curated",
      version: "1",
      requiresAuth: false,
      transport: "stdio",
      command: "echo",
    },
    {
      id: "b",
      name: "B",
      trustTier: "community",
      version: "1",
      requiresAuth: false,
      transport: "stdio",
      command: "echo",
    },
  ],
};

describe("mcp catalog blocklist", () => {
  it("filters disabled listings", () => {
    const prefs = withDisabledListing(undefined, "a");
    expect(filterInstallableListings(document, prefs).map((l) => l.id)).toEqual([
      "b",
    ]);
  });

  it("report also disables the listing", () => {
    const prefs = withCatalogReport(undefined, {
      listingId: "b",
      reportedAt: "2026-10-29T00:00:00.000Z",
      note: "nope",
    });
    expect(prefs.disabledListingIds).toContain("b");
    expect(prefs.reports?.[0]?.note).toBe("nope");
  });
});
