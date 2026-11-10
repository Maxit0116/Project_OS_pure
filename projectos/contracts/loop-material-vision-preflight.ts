/**
 * Image material capability preflight (honest).
 *
 * - Never silently drop images — caller keeps a material card.
 * - Vision support comes from ModelGateway apiFormat (see
 *   loop-material-vision-capability) — not brand names.
 * - When supportsVision: parseLevel vision_attach once bytes are in contentRef.
 * - When !supportsVision: unsupported + explicit block (replace or change model).
 */
import {
  classifyLoopMaterialFormat,
  type LoopMaterialFormatClassification,
} from "./loop-task-material-formats.js";
import type { LoopTaskMaterialParseLevel } from "./loop-task-materials.js";
import { apiFormatSupportsVision } from "./loop-material-vision-capability.js";
import type { ModelApiFormat } from "./settings.js";

export type LoopImageVisionGate =
  | "not_image"
  | "model_lacks_vision"
  | "vision_wired"
  | "oversize"
  | "bytes_missing";

export type LoopImageVisionPreflight = {
  format: LoopMaterialFormatClassification;
  visionGate: LoopImageVisionGate;
  parseLevel: Extract<
    LoopTaskMaterialParseLevel,
    "vision_attach" | "unsupported"
  >;
  reason: string;
  maxBytes: number;
};

export const LOOP_IMAGE_MATERIAL_MAX_BYTES = 5 * 1024 * 1024;

export function evaluateImageMaterialCapability(input: {
  mimeType?: string | null;
  fileName?: string | null;
  sizeBytes?: number | null;
  /** Prefer apiFormat from resolved ModelProfile — source of ModelGateway truth. */
  apiFormat?: ModelApiFormat | null;
  /** @deprecated Prefer apiFormat; kept for call-site compatibility. */
  supportsVision?: boolean | null;
  hasBytes?: boolean | null;
}): LoopImageVisionPreflight {
  const format = classifyLoopMaterialFormat({
    ...(input.mimeType !== undefined ? { mimeType: input.mimeType } : {}),
    ...(input.fileName !== undefined ? { fileName: input.fileName } : {}),
  });
  const size =
    typeof input.sizeBytes === "number" && Number.isFinite(input.sizeBytes)
      ? input.sizeBytes
      : null;
  const supportsVision =
    input.apiFormat != null
      ? apiFormatSupportsVision(input.apiFormat)
      : input.supportsVision === true;

  if (format.formatId !== "image") {
    return {
      format,
      visionGate: "not_image",
      parseLevel: "unsupported",
      reason: format.reason,
      maxBytes: LOOP_IMAGE_MATERIAL_MAX_BYTES,
    };
  }

  if (size != null && size > LOOP_IMAGE_MATERIAL_MAX_BYTES) {
    return {
      format,
      visionGate: "oversize",
      parseLevel: "unsupported",
      reason: `Image ${size}B exceeds first-batch ${LOOP_IMAGE_MATERIAL_MAX_BYTES}B budget — kept as card, not silently dropped`,
      maxBytes: LOOP_IMAGE_MATERIAL_MAX_BYTES,
    };
  }

  if (!supportsVision) {
    return {
      format,
      visionGate: "model_lacks_vision",
      parseLevel: "unsupported",
      reason:
        "Image kept as material card; active ModelGateway apiFormat lacks vision — replace image or switch to openai_chat/anthropic_messages profile (blocked, not silently dropped)",
      maxBytes: LOOP_IMAGE_MATERIAL_MAX_BYTES,
    };
  }

  if (input.hasBytes === false) {
    return {
      format,
      visionGate: "bytes_missing",
      parseLevel: "unsupported",
      reason:
        "Vision-capable profile selected but image bytes missing from contentRef — cannot attach to ModelGateway.images",
      maxBytes: LOOP_IMAGE_MATERIAL_MAX_BYTES,
    };
  }

  return {
    format,
    visionGate: "vision_wired",
    parseLevel: "vision_attach",
    reason:
      "Image bytes will attach via ModelGatewayRequest.images (openai_chat/anthropic_messages adapters)",
    maxBytes: LOOP_IMAGE_MATERIAL_MAX_BYTES,
  };
}
