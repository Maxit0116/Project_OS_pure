import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { createMockSampleWorkspace } from "../../client/mock-project-os-api-client.js";
import { ProjectOSSettingsSchema } from "../../contracts/settings.js";
import {
  ProjectOSWorkspaceStore,
  type LoadedProjectOSWorkspace,
} from "../../persistence/index.js";
import { ProjectOSLocalApi } from "../project-os-local-api.js";
import {
  readBundledCatalogBody,
  readBundledCatalogPublicKey,
  readBundledCatalogSignature,
} from "./bundled-assets.js";
import { McpCatalogClient } from "./client.js";

class InMemoryStore extends ProjectOSWorkspaceStore {
  constructor(private workspace: LoadedProjectOSWorkspace) {
    super();
  }

  override loadWorkspace(workspaceRoot: string): LoadedProjectOSWorkspace {
    return {
      ...this.workspace,
      workspaceRoot,
      projectOSRoot: `${workspaceRoot}/.projectos`,
    };
  }

  override writeSettings(
    _workspaceRoot: string,
    settings: LoadedProjectOSWorkspace["settings"],
  ) {
    this.workspace.settings = ProjectOSSettingsSchema.parse(settings);
    return this.workspace.settings;
  }
}

describe("ProjectOSLocalApi MCP catalog surface", () => {
  async function createApi(openExternalUrl?: (url: string) => Promise<void>) {
    const workspace = createMockSampleWorkspace();
    const cacheRoot = await mkdtemp(join(tmpdir(), "mcp-cat-api-"));
    const catalogClient = new McpCatalogClient({
      cacheRoot,
      publicKeySpkiBase64: readBundledCatalogPublicKey(),
      defaultCatalogUrl: "https://catalog.example.test/mcp/catalog.json",
      fetchImpl: vi.fn(async () => {
        throw new Error("offline");
      }) as unknown as typeof fetch,
      readBundled: () => ({
        bodyUtf8: readBundledCatalogBody(),
        signatureBase64: readBundledCatalogSignature(),
      }),
    });
    const api = new ProjectOSLocalApi({
      sampleWorkspaceRoot: workspace.workspaceRoot,
      workspaceStore: new InMemoryStore(workspace),
      mcpCatalogClient: catalogClient,
      mcpCatalogCacheRoot: cacheRoot,
      ...(openExternalUrl ? { openExternalUrl } : {}),
    });
    const project = await api.openSampleWorkspace();
    return { api, projectId: project.projectId };
  }

  it("lists catalog, installs with provenance, and keeps community disabled", async () => {
    const { api, projectId } = await createApi();
    const view = await api.listMcpCatalog(projectId);
    expect(view.document.listings.length).toBeGreaterThan(0);
    const curated = view.document.listings.find((l) => l.trustTier === "curated");
    const community = view.document.listings.find((l) => l.trustTier === "community");
    expect(curated).toBeTruthy();
    expect(community).toBeTruthy();

    const afterCurated = await api.installMcpFromCatalog(projectId, {
      listingId: curated!.id,
      enabled: true,
    });
    const installedCurated = afterCurated.mcpServers?.find(
      (s) => s.provenance?.listingId === curated!.id,
    );
    expect(installedCurated?.enabled).toBe(true);
    expect(installedCurated?.provenance?.trustTier).toBe("curated");

    const afterCommunity = await api.installMcpFromCatalog(projectId, {
      listingId: community!.id,
      enabled: true,
    });
    const installedCommunity = afterCommunity.mcpServers?.find(
      (s) => s.provenance?.listingId === community!.id,
    );
    expect(installedCommunity?.enabled).toBe(false);
  });

  it("hides disabled listings and records local reports", async () => {
    const openExternal = vi.fn(async () => undefined);
    const { api, projectId } = await createApi(openExternal);
    const before = await api.listMcpCatalog(projectId);
    const target = before.document.listings[0]!;
    await api.disableMcpCatalogListing(projectId, target.id);
    const afterDisable = await api.listMcpCatalog(projectId);
    expect(afterDisable.document.listings.every((l) => l.id !== target.id)).toBe(
      true,
    );

    const other = afterDisable.document.listings[0];
    expect(other).toBeTruthy();
    const reported = await api.reportMcpCatalogListing(projectId, {
      listingId: other!.id,
      note: "suspicious",
    });
    expect(
      reported.mcpMarketplace?.reports?.some((r) => r.listingId === other!.id),
    ).toBe(true);
    expect(reported.mcpMarketplace?.disabledListingIds?.includes(other!.id)).toBe(
      true,
    );
    expect(openExternal).toHaveBeenCalled();
  });
});
