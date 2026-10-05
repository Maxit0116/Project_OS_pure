import type { PromptRefineRequest } from "../contracts/prompt-refinement.js";
import type { ProjectOSSettings } from "../contracts/settings.js";

export type ExecutionBackend = "fixture" | "model";

export interface ExecutionRouteDecision {
  backend: ExecutionBackend;
  reason: string;
  forceFixture: boolean;
}

export function shouldUsePresentationFixture(
  settings: ProjectOSSettings,
): boolean {
  return (
    settings.presentationMode ||
    settings.execution.mode === "fixture"
  );
}

export function resolveExecutionBackend(
  settings: ProjectOSSettings,
): ExecutionRouteDecision {
  if (shouldUsePresentationFixture(settings)) {
    return {
      backend: "fixture",
      reason: "presentation_mode",
      forceFixture: true,
    };
  }

  if (settings.execution.mode === "model" || settings.execution.mode === "auto") {
    const hasModel = settings.modelProfiles.length > 0;
    return {
      backend: hasModel ? "model" : "fixture",
      reason: hasModel ? "model_configured" : "model_missing_fallback",
      forceFixture: !hasModel,
    };
  }

  return {
    backend: "fixture",
    reason: "no_provider_configured",
    forceFixture: true,
  };
}

export function refinementUsesModel(settings: ProjectOSSettings): boolean {
  const route = resolveExecutionBackend(settings);
  return route.backend === "model" && !route.forceFixture;
}

export function agentRunUsesExternal(_settings: ProjectOSSettings): boolean {
  return false;
}

export function agentRunUsesModel(settings: ProjectOSSettings): boolean {
  const route = resolveExecutionBackend(settings);
  return route.backend === "model" && !route.forceFixture;
}

export interface RefinementContext {
  request: PromptRefineRequest;
  settings: ProjectOSSettings;
}

export function pickRefinementBackend(
  context: RefinementContext,
): ExecutionRouteDecision {
  if (shouldUsePresentationFixture(context.settings)) {
    return {
      backend: "fixture",
      reason: "presentation_mode",
      forceFixture: true,
    };
  }

  if (
    context.settings.modelProfiles.length > 0 &&
    context.settings.execution.mode !== "fixture"
  ) {
    return {
      backend: "model",
      reason: "model_profile_available",
      forceFixture: false,
    };
  }

  return {
    backend: "fixture",
    reason: "refinement_fallback",
    forceFixture: true,
  };
}
