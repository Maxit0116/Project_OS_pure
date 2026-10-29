import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createMockSampleWorkspace } from "../../client/mock-project-os-api-client.js";
import { ProjectOSSettingsSchema } from "../../contracts/settings.js";
import {
  ProjectOSWorkspaceStore,
  type LoadedProjectOSWorkspace,
} from "../../persistence/index.js";
import { createGitHubAuthRef, InMemorySecretStore } from "../../persistence/secret-store.js";
import { ProjectOSLocalApi } from "../project-os-local-api.js";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

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

describe("ProjectOSLocalApi GitHub auth surface", () => {
  it("exposes status, mock connect, profile, and disconnect", async () => {
    const workspace = createMockSampleWorkspace();
    workspace.settings = ProjectOSSettingsSchema.parse({
      ...workspace.settings,
      presentationMode: true,
    });
    const secrets = new InMemorySecretStore();
    const userDataPath = mkdtempSync(join(tmpdir(), "pos-gh-api-"));
    dirs.push(userDataPath);
    const api = new ProjectOSLocalApi({
      sampleWorkspaceRoot: workspace.workspaceRoot,
      workspaceStore: new InMemoryStore(workspace),
      secretStore: secrets,
      userDataPath,
    });
    await api.openSampleWorkspace();

    expect((await api.getGitHubAuthStatus()).connected).toBe(false);

    const began = await api.beginGitHubOAuth();
    expect(began.kind).toBe("connected");
    expect(await secrets.get(createGitHubAuthRef())).toBe("mock-github-token");
    expect((await api.getGitHubAuthStatus()).login).toBe("demo-user");

    const profile = await api.getAccountProfile();
    expect(profile?.login).toBe("demo-user");
    expect(JSON.stringify(profile)).not.toContain("mock-github-token");

    const after = await api.disconnectGitHub();
    expect(after.connected).toBe(false);
    expect(await secrets.has(createGitHubAuthRef())).toBe(false);
    expect(await api.getAccountProfile()).toBeNull();
  });
});
