import type { ModelProfile, ProjectOSSettings } from "./settings.js";

export interface ModelProfileDeletionRepair {
  settings: ProjectOSSettings;
  selectedModelProfileId: string | null;
  removedProfile: ModelProfile;
  reboundAgentProfileIds: string[];
}

export function synchronizeModelProfileDefaults(
  settings: ProjectOSSettings,
): ProjectOSSettings {
  const defaultModelProfileId =
    settings.execution.defaultModelProfileId?.trim() || undefined;
  return {
    ...settings,
    execution: {
      ...settings.execution,
      defaultModelProfileId,
    },
    modelProfiles: settings.modelProfiles.map((profile) => ({
      ...profile,
      isDefault: profile.id === defaultModelProfileId,
    })),
  };
}

export function repairSettingsAfterModelProfileDelete(
  settings: ProjectOSSettings,
  profileId: string,
  selectedModelProfileId: string | null,
): ModelProfileDeletionRepair | undefined {
  const removedProfile = settings.modelProfiles.find(
    (profile) => profile.id === profileId,
  );
  if (!removedProfile) {
    return undefined;
  }

  const modelProfiles = settings.modelProfiles.filter(
    (profile) => profile.id !== profileId,
  );
  const currentDefaultId = settings.execution.defaultModelProfileId;
  const mustPromote =
    currentDefaultId === profileId || selectedModelProfileId === profileId;
  const preservedDefault = modelProfiles.some(
    (profile) => profile.id === currentDefaultId,
  )
    ? currentDefaultId
    : undefined;
  const nextDefaultId = mustPromote
    ? modelProfiles[0]?.id
    : preservedDefault ?? modelProfiles[0]?.id;
  const reboundAgentProfileIds: string[] = [];
  const agentProfiles = settings.agentProfiles.map((profile) => {
    if (profile.modelProfileId !== profileId) {
      return profile;
    }
    reboundAgentProfileIds.push(profile.id);
    return {
      ...profile,
      modelProfileId: nextDefaultId ?? "",
    };
  });
  const selectedModelStillExists = modelProfiles.some(
    (profile) => profile.id === selectedModelProfileId,
  );

  return {
    settings: synchronizeModelProfileDefaults({
      ...settings,
      execution: {
        ...settings.execution,
        defaultModelProfileId: nextDefaultId,
      },
      modelProfiles,
      agentProfiles,
    }),
    selectedModelProfileId: selectedModelStillExists
      ? selectedModelProfileId
      : nextDefaultId ?? null,
    removedProfile,
    reboundAgentProfileIds,
  };
}

export function modelSettingsIntegrityError(
  settings: ProjectOSSettings,
): string | undefined {
  const modelProfileIds = new Set<string>();
  for (const profile of settings.modelProfiles) {
    if (modelProfileIds.has(profile.id)) {
      return `Duplicate model profile id '${profile.id}'`;
    }
    modelProfileIds.add(profile.id);
  }

  const defaultModelProfileId = settings.execution.defaultModelProfileId;
  if (
    defaultModelProfileId &&
    !modelProfileIds.has(defaultModelProfileId)
  ) {
    return `Default model profile '${defaultModelProfileId}' does not exist`;
  }

  for (const agentProfile of settings.agentProfiles) {
    if (
      agentProfile.modelProfileId &&
      !modelProfileIds.has(agentProfile.modelProfileId)
    ) {
      return `Agent profile '${agentProfile.id}' references missing model profile '${agentProfile.modelProfileId}'`;
    }
  }
  return undefined;
}
