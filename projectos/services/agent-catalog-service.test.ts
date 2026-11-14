import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  createWorkforceAgent,
  listWorkforceAgents,
} from "./agent-pool-index.js";
import {
  collectAgentListingDependencyIds,
  exportWorkforceAgentPack,
  installAgentFromListing,
  listInstalledMarketplaceAgentListingIds,
  uninstallAgentFromListing,
  workforceDraftFromAgentListing,
} from "./agent-catalog-service.js";
import { AgentCatalogClient } from "./agent-marketplace/client.js";
import { AgentCatalogDocumentSchema } from "../contracts/agent-marketplace.js";

describe("agent catalog install/export", () => {
  it("loads the expanded talent-library bundled catalog", () => {
    const client = new AgentCatalogClient({ cacheRoot: "/tmp/agent-mkt-unused" });
    const view = client.loadBundled();
    const parsed = AgentCatalogDocumentSchema.parse(view.document);
    expect(parsed.listings.length).toBeGreaterThanOrEqual(14);
    expect(parsed.listings.some((l) => l.id === "curated.frontend-engineer")).toBe(true);
    expect(parsed.listings.some((l) => l.id === "curated.domain-specialist")).toBe(true);
    expect(parsed.listings.some((l) => l.id === "curated.code-reviewer")).toBe(true);
    const frontend = parsed.listings.find((l) => l.id === "curated.frontend-engineer");
    expect(frontend?.department).toBe("software_development");
    expect(frontend?.suggestedLoopAgentRole).toBe("coder");
    expect(frontend?.modelTierHint).toBe("balanced");
  });

  it("maps a Template listing into a Workforce draft for extra Instances", () => {
    const client = new AgentCatalogClient({ cacheRoot: "/tmp/agent-mkt-unused" });
    const listing = client
      .loadBundled()
      .document.listings.find((entry) => entry.id === "curated.product-planner");
    expect(listing).toBeTruthy();
    const draft = workforceDraftFromAgentListing(listing!, {
      displayNameSuffix: "(copy)",
    });
    expect(draft.displayName).toContain("Product");
    expect(draft.displayName).toContain("(copy)");
    expect(draft.modelProfileId).toBeNull();
    expect(draft.mcpServerIds).toEqual([]);
  });

  it("collects Template dependency ids and can bind MCP server ids on install", async () => {
    const client = new AgentCatalogClient({ cacheRoot: "/tmp/agent-mkt-unused" });
    const listing = client
      .loadBundled()
      .document.listings.find((entry) => entry.id === "curated.frontend-engineer");
    expect(listing).toBeTruthy();
    const deps = collectAgentListingDependencyIds(listing!);
    expect(deps.skillIds).toContain("community.impeccable");
    expect(deps.mcpListingIds).toEqual(
      expect.arrayContaining(["community.storybook-mcp", "curated.playwright"]),
    );
    expect(deps.rulesPackIds).toContain("curated.typescript-strict");

    const projectOSRoot = await mkdtemp(join(tmpdir(), "agent-mkt-bind-"));
    const installed = installAgentFromListing({
      projectOSRoot,
      listing: listing!,
      catalogVersion: "test",
      mcpServerIds: ["mcp_playwright_test", "mcp_storybook_test"],
    });
    expect(installed.config.skillIds).toContain("community.impeccable");
    expect(installed.config.mcpServerIds).toEqual([
      "mcp_playwright_test",
      "mcp_storybook_test",
    ]);
  });

  it("installs catalog agent without selecting it as active session agent", async () => {
    const projectOSRoot = await mkdtemp(join(tmpdir(), "agent-mkt-"));
    const client = new AgentCatalogClient({ cacheRoot: projectOSRoot });
    const view = client.loadBundled();
    const listing = view.document.listings.find((entry) => entry.id === "curated.code-reviewer");
    expect(listing).toBeTruthy();

    const installed = installAgentFromListing({
      projectOSRoot,
      projectId: "proj_test",
      listing: listing!,
      catalogVersion: view.document.version,
    });
    expect(installed.definitionId).toBe("agent_mkt_curated.code-reviewer");
    expect(installed.config.marketplaceProvenance?.listingId).toBe("curated.code-reviewer");
    expect(installed.config.kind).toBe("workforce");
    expect(listInstalledMarketplaceAgentListingIds(projectOSRoot)).toContain(
      "curated.code-reviewer",
    );
    expect(listWorkforceAgents(projectOSRoot).some((a) => a.definitionId === installed.definitionId)).toBe(
      true,
    );

    uninstallAgentFromListing({
      projectOSRoot,
      listingId: listing!.id,
    });
    expect(listInstalledMarketplaceAgentListingIds(projectOSRoot)).not.toContain(
      "curated.code-reviewer",
    );
  });

  it("exports a workforce agent pack and reimports it", async () => {
    const projectOSRoot = await mkdtemp(join(tmpdir(), "agent-export-"));
    const created = createWorkforceAgent(projectOSRoot, {
      projectId: "proj_test",
      draft: {
        displayName: "QA Buddy",
        roleLabel: "QA",
        instructions: "Review carefully.",
        skillIds: ["curated.ask-mode"],
        mcpServerIds: [],
      },
    });
    const exported = exportWorkforceAgentPack({
      projectOSRoot,
      definitionId: created.definitionId,
      mcpServers: [],
    });
    expect(exported.listing.trustTier).toBe("community");
    expect(exported.listing.skillIds).toContain("curated.ask-mode");
    expect(exported.packJson).toContain("QA Buddy");

    const reimported = installAgentFromListing({
      projectOSRoot,
      listing: exported.listing,
      catalogVersion: "export",
      source: "export-reimport",
    });
    expect(reimported.config.marketplaceProvenance?.source).toBe("export-reimport");
    expect(reimported.config.displayName).toBe("QA Buddy");
  });

  it("refuses overwrite without replace", async () => {
    const projectOSRoot = await mkdtemp(join(tmpdir(), "agent-conflict-"));
    const client = new AgentCatalogClient({ cacheRoot: projectOSRoot });
    const view = client.loadBundled();
    const listing = view.document.listings[0]!;
    installAgentFromListing({
      projectOSRoot,
      listing,
      catalogVersion: view.document.version,
    });
    expect(() =>
      installAgentFromListing({
        projectOSRoot,
        listing,
        catalogVersion: view.document.version,
      }),
    ).toThrow(/already installed/u);
  });
});
