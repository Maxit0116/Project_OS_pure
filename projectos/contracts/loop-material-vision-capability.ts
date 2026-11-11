/**
 * Production vision capability for Loop materials → ModelGateway.
 *
 * Source of truth: provider adapters that actually attach `images`
 * (`openai_chat` / `anthropic_messages`). Ollama path ignores images today.
 * Connection probe / brand name ≠ vision support.
 */
import type { ModelApiFormat, ModelProfile } from "./settings.js";
import { normalizeModelProfile } from "./settings.js";
import type { ModelImagePart } from "./model-gateway.js";
import type { LoopTaskMaterial } from "./loop-task-materials.js";
import { resolveSafeImageContentRef } from "./loop-material-image-bytes.js";

export type LoopVisionCapability = {
  supportsVision: boolean;
  apiFormat: ModelApiFormat | null;
  reason: string;
};

/** Formats whose adapters pass ModelGatewayRequest.images to the wire. */
export function apiFormatSupportsVision(apiFormat: ModelApiFormat | null | undefined): boolean {
  return apiFormat === "openai_chat" || apiFormat === "anthropic_messages";
}

export function resolveLoopVisionCapability(
  profile: ModelProfile | null | undefined,
): LoopVisionCapability {
  if (!profile) {
    return {
      supportsVision: false,
      apiFormat: null,
      reason: "No model profile — vision materials cannot attach to ModelGateway",
    };
  }
  const resolved = normalizeModelProfile(profile);
  const supportsVision = apiFormatSupportsVision(resolved.apiFormat);
  return {
    supportsVision,
    apiFormat: resolved.apiFormat,
    reason: supportsVision
      ? `ModelGateway apiFormat=${resolved.apiFormat} accepts images[] on complete()`
      : `ModelGateway apiFormat=${resolved.apiFormat} does not attach images (vision blocked)`,
  };
}

/**
 * Build ModelGateway `images` parts from run materials.
 * Only png/jpeg with verified data: contentRef (MIME + magic + size); max 4 parts.
 * Does not invent vision when bytes are missing; path/upload refs do not attach.
 * Prompt/file instructions cannot increase privileges past this gate.
 */
export function materialImagesToGatewayParts(
  materials: LoopTaskMaterial[] | undefined,
  options?: { maxParts?: number },
): ModelImagePart[] {
  const maxParts = options?.maxParts ?? 4;
  const out: ModelImagePart[] = [];
  for (const material of materials ?? []) {
    if (out.length >= maxParts) break;
    if (material.kind !== "image" && !(material.mimeType ?? "").startsWith("image/")) {
      continue;
    }
    if (material.parseStatus === "failed") continue;
    const resolved = resolveSafeImageContentRef(material.contentRef);
    if (!resolved.ok) continue;
    out.push({ mimeType: resolved.mimeType, base64: resolved.base64 });
  }
  return out;
}

/** True when materials include images that need vision to be useful. */
export function materialsRequireVision(
  materials: LoopTaskMaterial[] | undefined,
): boolean {
  return (materials ?? []).some(
    (material) =>
      material.kind === "image" ||
      (material.mimeType ?? "").startsWith("image/"),
  );
}
