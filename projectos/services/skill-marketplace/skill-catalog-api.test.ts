import { mkdtemp, rm } from "node:fs/promises";
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
import { skillExists } from "../skill-catalog-service.js";
import {
  readBundledSkillCatalogBody,
  readBundledSkillCatalogPublicKey,
  readBundledSkillCatalogSignature,
} from "./bundled-assets.js";
import { SkillCatalogClient } from "./client.js";

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

describe("ProjectOSLocalApi skill catalog surface", () => {
  async function createApi() {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "skill-ws-"));
    const base = createMockSampleWorkspace();
    const workspace = { ...base, workspaceRoot };
    const cacheRoot = await mkdtemp(join(tmpdir(), "skill-cat-api-"));
    const catalogClient = new SkillCatalogClient({
      cacheRoot,
      publicKeySpkiBase64: readBundledSkillCatalogPublicKey(),
      defaultCatalogUrl: "https://catalog.example.test/skills/catalog.json",
      fetchImpl: vi.fn(async () => {
        throw new Error("offline");
      }) as unknown as typeof fetch,
      readBundled: () => ({
        bodyUtf8: readBundledSkillCatalogBody(),
        signatureBase64: readBundledSkillCatalogSignature(),
      }),
    });
    const api = new ProjectOSLocalApi({
      sampleWorkspaceRoot: workspace.workspaceRoot,
      workspaceStore: new InMemoryStore(workspace),
      skillCatalogClient: catalogClient,
      skillCatalogCacheRoot: cacheRoot,
    });
    const project = await api.openSampleWorkspace();
    return { api, projectId: project.projectId, workspaceRoot, cacheRoot };
  }

  it("lists, installs without overwrite, then replaces", async () => {
    const { api, projectId, workspaceRoot } = await createApi();
    try {
      const view = await api.listSkillCatalog(projectId);
      const listing = view.document.listings[0]!;
      const installed = await api.installSkillFromCatalog(projectId, {
        listingId: listing.id,
      });
      expect(installed.id).toBeTruthy();
      expect(skillExists(workspaceRoot, listing.id)).toBe(true);
      await expect(
        api.installSkillFromCatalog(projectId, { listingId: listing.id }),
      ).rejects.toThrow(/already exists/i);
      const replaced = await api.installSkillFromCatalog(projectId, {
        listingId: listing.id,
        replace: true,
      });
      expect(replaced.id).toBe(installed.id);
      const skills = await api.listSkills(projectId);
      expect(skills.skills.some((s) => s.id === installed.id)).toBe(true);
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("hides disabled skill listings", async () => {
    const { api, projectId, workspaceRoot } = await createApi();
    try {
      const before = await api.listSkillCatalog(projectId);
      const target = before.document.listings[0]!;
      await api.disableSkillCatalogListing(projectId, target.id);
      const after = await api.listSkillCatalog(projectId);
      expect(after.document.listings.every((l) => l.id !== target.id)).toBe(true);
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });
});
