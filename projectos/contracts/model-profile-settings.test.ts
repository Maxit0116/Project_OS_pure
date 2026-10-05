import { describe, expect, it } from "vitest";

import { createDefaultSettings } from "./settings.js";
import {
  repairSettingsAfterModelProfileDelete,
  synchronizeModelProfileDefaults,
} from "./model-profile-settings.js";

describe("model profile settings integrity", () => {
  it("promotes the first remaining model and rebinds agents when deleting the default", () => {
    const settings = createDefaultSettings("project-model-delete", false);
    settings.modelProfiles = [modelProfile("model-a"), modelProfile("model-b")];
    settings.execution.defaultModelProfileId = "model-a";
    settings.agentProfiles[0]!.modelProfileId = "model-a";

    const repaired = repairSettingsAfterModelProfileDelete(
      settings,
      "model-a",
      "model-a",
    );

    expect(repaired).toBeDefined();
    expect(repaired!.settings.execution.defaultModelProfileId).toBe("model-b");
    expect(repaired!.selectedModelProfileId).toBe("model-b");
    expect(repaired!.settings.modelProfiles).toEqual([
      expect.objectContaining({ id: "model-b", isDefault: true }),
    ]);
    expect(repaired!.settings.agentProfiles[0]!.modelProfileId).toBe("model-b");
    expect(repaired!.reboundAgentProfileIds).toEqual(["default-feature"]);
  });

  it("clears default, selection, and agent bindings when deleting the last model", () => {
    const settings = createDefaultSettings("project-last-model", false);
    settings.modelProfiles = [modelProfile("only-model")];
    settings.execution.defaultModelProfileId = "only-model";
    settings.agentProfiles[0]!.modelProfileId = "only-model";

    const repaired = repairSettingsAfterModelProfileDelete(
      settings,
      "only-model",
      "only-model",
    );

    expect(repaired!.settings.modelProfiles).toEqual([]);
    expect(repaired!.settings.execution.defaultModelProfileId).toBeUndefined();
    expect(repaired!.selectedModelProfileId).toBeNull();
    expect(repaired!.settings.agentProfiles[0]!.modelProfileId).toBe("");
  });

  it("derives every isDefault flag from the execution default", () => {
    const settings = createDefaultSettings("project-default-sync", false);
    settings.modelProfiles = [
      { ...modelProfile("model-a"), isDefault: true },
      { ...modelProfile("model-b"), isDefault: false },
    ];
    settings.execution.defaultModelProfileId = "model-b";

    const synchronized = synchronizeModelProfileDefaults(settings);

    expect(synchronized.modelProfiles).toEqual([
      expect.objectContaining({ id: "model-a", isDefault: false }),
      expect.objectContaining({ id: "model-b", isDefault: true }),
    ]);
  });
});

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
