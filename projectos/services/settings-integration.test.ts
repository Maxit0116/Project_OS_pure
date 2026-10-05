import { describe, expect, it } from "vitest";

import { createMockSampleWorkspace } from "../client/mock-project-os-api-client.js";
import { ProjectOSLocalApi } from "./project-os-local-api.js";
import { pickRefinementBackend } from "./execution-router.js";

describe("settings API", () => {
  it("reads and updates project settings", async () => {
    const workspace = createMockSampleWorkspace();
    const api = new ProjectOSLocalApi({
      sampleWorkspaceRoot: workspace.workspaceRoot,
      workspaceStore: new InMemoryStore(workspace),
    });

    await api.openSampleWorkspace();
    const settings = await api.getSettings(workspace.project.projectId);
    expect(settings.presentationMode).toBe(false);
    expect(settings.execution.changeExecutionPolicy).toBe("automatic");
    expect(settings.agentProfiles.some((profile) => profile.kind === "feature_change")).toBe(
      true,
    );

    const updated = await api.updateSettings(workspace.project.projectId, {
      presentationMode: false,
      execution: {
        ...settings.execution,
        mode: "model",
        changeExecutionPolicy: "review_first",
      },
    });
    expect(updated.presentationMode).toBe(false);
    expect(updated.execution.mode).toBe("model");
    expect(updated.execution.changeExecutionPolicy).toBe("review_first");
  });

  it("normalizes authoritative defaults and rejects invalid model references", async () => {
    const workspace = createMockSampleWorkspace();
    const api = new ProjectOSLocalApi({
      sampleWorkspaceRoot: workspace.workspaceRoot,
      workspaceStore: new InMemoryStore(workspace),
    });
    const project = await api.openSampleWorkspace();
    const initial = await api.getSettings(project.projectId);
    const modelA = modelProfile("model-a");
    const modelB = modelProfile("model-b");

    const normalized = await api.updateSettings(project.projectId, {
      modelProfiles: [
        { ...modelA, isDefault: true },
        { ...modelB, isDefault: false },
      ],
      execution: {
        ...initial.execution,
        defaultModelProfileId: "model-b",
      },
    });
    expect(normalized.modelProfiles).toEqual([
      expect.objectContaining({ id: "model-a", isDefault: false }),
      expect.objectContaining({ id: "model-b", isDefault: true }),
    ]);

    await expect(api.updateSettings(project.projectId, {
      modelProfiles: [modelA, modelA],
    })).rejects.toMatchObject({
      code: "invalid_settings",
      message: expect.stringContaining("Duplicate model profile id"),
    });
    await expect(api.updateSettings(project.projectId, {
      execution: {
        ...normalized.execution,
        defaultModelProfileId: "missing-model",
      },
    })).rejects.toMatchObject({
      code: "invalid_settings",
      message: expect.stringContaining("does not exist"),
    });
    await expect(api.updateSettings(project.projectId, {
      agentProfiles: normalized.agentProfiles.map((profile, index) =>
        index === 0
          ? { ...profile, modelProfileId: "missing-model" }
          : profile,
      ),
    })).rejects.toMatchObject({
      code: "invalid_settings",
      message: expect.stringContaining("references missing model profile"),
    });
  });
});

describe("execution router", () => {
  it("forces fixture path in presentation mode", () => {
    const workspace = createMockSampleWorkspace();
    const route = pickRefinementBackend({
      request: {
        projectId: workspace.project.projectId,
        rawPrompt: "test",
      },
      settings: { ...workspace.settings, presentationMode: true },
    });
    expect(route.backend).toBe("fixture");
    expect(route.forceFixture).toBe(true);
  });
});

import { ProjectOSWorkspaceStore, type LoadedProjectOSWorkspace } from "../persistence/index.js";
import { CurrentWorkStateSchema } from "../contracts/context.js";
import { ProjectOSSettingsSchema } from "../contracts/settings.js";

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

  override async writeCurrentWork(
    _workspaceRoot: string,
    currentWork: LoadedProjectOSWorkspace["currentWork"],
  ): Promise<LoadedProjectOSWorkspace["currentWork"]> {
    this.workspace.currentWork = CurrentWorkStateSchema.parse(currentWork);
    return this.workspace.currentWork;
  }
}

function modelProfile(id: string) {
  return {
    id,
    name: id,
    provider: "custom" as const,
    apiFormat: "openai_chat" as const,
    model: id,
    baseUrl: "https://example.invalid/v1",
    apiKeyRef: `model_profile:${id}`,
  };
}
