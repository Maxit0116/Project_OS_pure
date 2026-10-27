import {
  ExecutorSelectionSchema,
  type ExecutorSelection,
  type RunExecutor,
} from "../../contracts/executor-selection.js";
import {
  modelProfileLabel,
  type ModelProfile,
  type ProjectOSSettings,
  type ThinkingDepth,
} from "../../contracts/settings.js";
import { ProjectOSError } from "../../errors.js";
import { cloneJson } from "../../utils/json.js";

/** Server-only configuration snapshot; never expose this as run metadata. */
export interface ModelExecutionSnapshot {
  profile: ModelProfile;
  thinkingDepth: ThinkingDepth;
}

export function resolveModelExecution(
  settings: ProjectOSSettings,
  selection?: ExecutorSelection,
  fallbackProfileId?: string,
): ModelExecutionSnapshot | undefined {
  const explicit = selection === undefined
    ? undefined
    : ExecutorSelectionSchema.parse(selection);
  if (explicit && (settings.presentationMode || settings.execution.mode === "fixture")) {
    throw new ProjectOSError(
      "invalid_settings",
      "Turn off presentation/fixture mode before choosing a live executor",
    );
  }
  if (explicit?.kind === "runtime") {
    throw new ProjectOSError(
      "not_implemented",
      `Agent runtime profile '${explicit.runtimeProfileId}' is not installed`,
    );
  }
  const id =
    explicit?.modelProfileId ??
    fallbackProfileId ??
    settings.execution.defaultModelProfileId ??
    settings.modelProfiles.find((p) => p.isDefault)?.id;
  const profile = id ? settings.modelProfiles.find((p) => p.id === id) : undefined;
  if (explicit && !profile) {
    throw new ProjectOSError("settings_not_found", `Selected model profile '${id}' was not found`);
  }
  return profile
    ? {
        profile: cloneJson(profile),
        thinkingDepth: settings.execution.thinkingDepth ?? "medium",
      }
    : undefined;
}

export function runExecutorMetadata(binding: ModelExecutionSnapshot): RunExecutor {
  return {
    kind: "model",
    executorId: "projectos",
    modelProfileId: binding.profile.id,
    label: modelProfileLabel(binding.profile),
    provider: binding.profile.provider,
    model: binding.profile.model,
    thinkingDepth: binding.thinkingDepth,
  };
}
