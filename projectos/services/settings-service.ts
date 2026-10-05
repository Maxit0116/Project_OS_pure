import {
  ProjectOSSettingsSchema,
  normalizeModelProfiles,
  type ConnectionTestResult,
  type ModelProfile,
  type ProjectOSSettings,
  type SettingsPatch,
} from "../contracts/settings.js";
import {
  modelSettingsIntegrityError,
  synchronizeModelProfileDefaults,
} from "../contracts/model-profile-settings.js";
import { ProjectOSError } from "../errors.js";
import type { LoadedProjectOSWorkspace } from "../persistence/workspace-store.js";
import type { SecretStore } from "../persistence/secret-store.js";
import {
  createSecretRef,
} from "../persistence/secret-store.js";
import { cloneJson } from "../utils/json.js";

export class SettingsService {
  constructor(private readonly secretStore: SecretStore) {}

  getSettings(workspace: LoadedProjectOSWorkspace): ProjectOSSettings {
    return cloneJson(normalizeSettings(workspace.settings));
  }

  updateSettings(
    workspace: LoadedProjectOSWorkspace,
    patch: SettingsPatch,
  ): ProjectOSSettings {
    const merged = ProjectOSSettingsSchema.parse({
      ...workspace.settings,
      ...patch,
      execution: patch.execution
        ? { ...workspace.settings.execution, ...patch.execution }
        : workspace.settings.execution,
      updatedAt: new Date().toISOString(),
    });

    if (patch.modelProfiles) {
      merged.modelProfiles = validateModelProfiles(patch.modelProfiles);
    } else if (merged.modelProfiles.length > 0) {
      merged.modelProfiles = normalizeModelProfiles(merged.modelProfiles);
    }

    const integrityError = modelSettingsIntegrityError(merged);
    if (integrityError) {
      throw new ProjectOSError("invalid_settings", integrityError);
    }
    const normalized = synchronizeModelProfileDefaults(merged);

    workspace.settings = normalized;
    return cloneJson(normalizeSettings(normalized));
  }

  async setModelProfileSecret(
    profileId: string,
    apiKey: string,
  ): Promise<string> {
    const ref = createSecretRef(profileId);
    await this.secretStore.set(ref, apiKey);
    return ref;
  }

  async getSecret(ref: string): Promise<string | undefined> {
    return this.secretStore.get(ref);
  }

  async deleteSecret(ref: string): Promise<void> {
    await this.secretStore.delete(ref);
  }

  resolveModelProfile(
    settings: ProjectOSSettings,
    profileId?: string,
  ): ModelProfile | undefined {
    const id =
      profileId ??
      settings.execution.defaultModelProfileId ??
      settings.modelProfiles.find((profile) => profile.isDefault)?.id;
    if (!id) {
      return undefined;
    }
    return settings.modelProfiles.find((profile) => profile.id === id);
  }

  resolveAgentProfile(
    settings: ProjectOSSettings,
    kind: "feature_change" | "debug_fix" | "custom",
    profileId?: string,
  ) {
    if (profileId) {
      const explicit = settings.agentProfiles.find((profile) => profile.id === profileId);
      if (explicit) {
        return explicit;
      }
    }

    const kindProfile = settings.agentProfiles.find((profile) => profile.kind === kind);
    if (kindProfile) {
      return kindProfile;
    }

    const defaultId = settings.execution.defaultAgentProfileId;
    if (defaultId) {
      const defaultProfile = settings.agentProfiles.find((profile) => profile.id === defaultId);
      if (defaultProfile) {
        return defaultProfile;
      }
    }

    return settings.agentProfiles[0];
  }

  hasConfiguredModel(settings: ProjectOSSettings): boolean {
    return settings.modelProfiles.some((profile) => profile.apiKeyRef.length > 0);
  }

  createConnectionTestResult(
    ok: boolean,
    latencyMs: number,
    profile?: ModelProfile,
    message?: string,
  ): ConnectionTestResult {
    return {
      ok,
      latencyMs,
      message,
      provider: profile?.provider,
      model: profile?.model,
    };
  }
}

function validateModelProfiles(profiles: ModelProfile[]): ModelProfile[] {
  for (const profile of profiles) {
    if (profile.provider === "custom" && !profile.baseUrl?.trim()) {
      throw new ProjectOSError(
        "settings_not_found",
        `Model profile '${profile.id}' requires baseUrl when provider is custom`,
      );
    }
  }
  return profiles;
}

function normalizeSettings(settings: ProjectOSSettings): ProjectOSSettings {
  return synchronizeModelProfileDefaults(ProjectOSSettingsSchema.parse({
    ...settings,
    execution: {
      ...settings.execution,
      thinkingDepth: settings.execution.thinkingDepth ?? "medium",
    },
    modelProfiles: normalizeModelProfiles(settings.modelProfiles),
  }));
}

export function createModelProfileId(): string {
  return `model_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createAgentProfileId(): string {
  return `agent_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function requireModelProfile(
  settings: ProjectOSSettings,
  profileId: string,
): ModelProfile {
  const profile = settings.modelProfiles.find((candidate) => candidate.id === profileId);
  if (!profile) {
    throw new ProjectOSError(
      "settings_not_found",
      `Model profile '${profileId}' was not found`,
    );
  }
  return profile;
}
