import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { loadProjectRulesMarkdown } from "./harness/rules.js";
import {
  installProjectRulesPack,
  listInstalledRulesPackIds,
  uninstallProjectRulesPack,
} from "./rules-catalog-service.js";
import { RulesCatalogClient } from "./rules-marketplace/client.js";

describe("rules catalog install", () => {
  it("installs under .projectos/rules/<packId>/ and harness loads markdown", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "rules-install-"));
    const client = new RulesCatalogClient({ cacheRoot: workspaceRoot });
    const view = client.loadBundled();
    const listing = view.document.listings.find((entry) => entry.id === "curated.typescript-strict");
    expect(listing).toBeTruthy();

    const installed = installProjectRulesPack({
      workspaceRoot,
      listing: listing!,
      catalogVersion: view.document.version,
    });
    expect(installed.packId).toBe("curated.typescript-strict");
    expect(listInstalledRulesPackIds(workspaceRoot)).toContain("curated.typescript-strict");

    const markdown = loadProjectRulesMarkdown(workspaceRoot);
    expect(markdown).toContain("TypeScript Strict");
    expect(markdown).toContain("Prefer `unknown` over `any`");

    uninstallProjectRulesPack({
      workspaceRoot,
      listingId: listing!.id,
    });
    expect(listInstalledRulesPackIds(workspaceRoot)).not.toContain("curated.typescript-strict");
    expect(loadProjectRulesMarkdown(workspaceRoot)).not.toContain("TypeScript Strict");
  });

  it("refuses overwrite without replace", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "rules-install-"));
    const client = new RulesCatalogClient({ cacheRoot: workspaceRoot });
    const view = client.loadBundled();
    const listing = view.document.listings[0]!;
    installProjectRulesPack({
      workspaceRoot,
      listing,
      catalogVersion: view.document.version,
    });
    expect(() =>
      installProjectRulesPack({
        workspaceRoot,
        listing,
        catalogVersion: view.document.version,
      }),
    ).toThrow(/already exists/u);
  });
});
