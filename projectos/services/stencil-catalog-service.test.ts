import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { UI_STENCIL_CATALOG, getStencilById } from "../contracts/ui-stencil.js";
import type { StencilCatalogListing } from "../contracts/stencil-marketplace.js";
import {
  exportStencilPackFromIds,
  installStencilFromListing,
  listInstalledStencilListingIds,
  listMergedStencilDefinitions,
  refreshProjectStencilOverlay,
  uninstallStencilFromListing,
} from "./stencil-catalog-service.js";
import { clearProjectStencilOverlay } from "../contracts/ui-stencil.js";

const listing: StencilCatalogListing = {
  id: "community.test-pill",
  name: "Test Pill Pack",
  description: "Test",
  trustTier: "community",
  version: "1.0.0",
  stencils: [
    {
      id: "mkt-test-pill",
      category: "base",
      title: "Test pill",
      tags: ["test"],
      description: "Test status pill",
      previewAsset: "stencils/previews/mkt-test-pill.png",
      briefTemplate: "Add a test pill labeled {{label}}.",
      codegen: { strategy: "brief-only" },
      licenseNote: "Test only",
    },
  ],
};

describe("stencil-catalog-service", () => {
  const roots: string[] = [];

  afterEach(async () => {
    clearProjectStencilOverlay();
    await Promise.all(
      roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
    );
  });

  async function tempRoot(): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), "st-cat-"));
    roots.push(root);
    return root;
  }

  it("installs under .projectos/stencils without mutating builtins", async () => {
    const workspaceRoot = await tempRoot();
    const before = UI_STENCIL_CATALOG.length;
    const installed = installStencilFromListing({
      workspaceRoot,
      listing,
      catalogVersion: "1",
      source: "catalog",
    });
    expect(installed[0]?.id).toBe("mkt-test-pill");
    expect(UI_STENCIL_CATALOG.length).toBe(before);

    const merged = listMergedStencilDefinitions(workspaceRoot);
    expect(merged.length).toBe(before + 1);
    expect(merged.some((s) => s.id === "mkt-test-pill")).toBe(true);
    expect(listInstalledStencilListingIds(workspaceRoot)).toEqual([
      "community.test-pill",
    ]);
    expect(getStencilById("mkt-test-pill")?.title).toBe("Test pill");

    const onDisk = JSON.parse(
      await readFile(
        join(workspaceRoot, ".projectos", "stencils", "community.test-pill.json"),
        "utf8",
      ),
    );
    expect(onDisk.provenance.kind).toBe("stencil");
    expect(onDisk.stencils[0].licenseNote).toBe("Test only");

    uninstallStencilFromListing({
      workspaceRoot,
      listingId: "community.test-pill",
    });
    expect(listInstalledStencilListingIds(workspaceRoot)).toEqual([]);
    expect(getStencilById("mkt-test-pill")).toBeUndefined();
    expect(getStencilById("btn-primary")?.category).toBe("base");
  });

  it("rejects packs that collide with builtin stencil ids", async () => {
    const workspaceRoot = await tempRoot();
    expect(() =>
      installStencilFromListing({
        workspaceRoot,
        listing: {
          ...listing,
          id: "community.collide",
          stencils: [
            {
              ...listing.stencils[0]!,
              id: "btn-primary",
            },
          ],
        },
        catalogVersion: "1",
      }),
    ).toThrow(/built-in/);
  });

  it("exports a shareable stencil pack and refreshes overlay", async () => {
    const workspaceRoot = await tempRoot();
    installStencilFromListing({
      workspaceRoot,
      listing,
      catalogVersion: "1",
    });
    refreshProjectStencilOverlay(workspaceRoot);
    const exported = exportStencilPackFromIds({
      stencilIds: ["mkt-test-pill"],
      title: "My Pill",
    });
    expect(exported.listing.trustTier).toBe("community");
    expect(exported.listing.stencils[0]?.id).toBe("mkt-test-pill");
    expect(exported.packJson).toContain('"kind": "stencil"');
  });
});
