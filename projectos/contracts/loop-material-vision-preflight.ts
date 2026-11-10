/**
 * Image material capability preflight (honest, offline).
 *
 * Rules:
 * - Never silently drop images — caller keeps a material card.
 * - Unsupported remains the correct safety parseLevel until a Pure vision
 *   attach path exists; this module only classifies the *gate*, not “done”.
 * - ModelProfile has no vision flag today — callers pass supportsVision
 *   explicitly (settings / gateway capability). Default false.
 */
import {
  classifyLoopMaterialFormat,
  type LoopMaterialFormatClassification,
} from "./loop-task-material-formats.js";

export type LoopImageVisionGate =
  /** MIME/ext not image — use format classifier instead. */
  | "not_image"
  /** Image, but active model does not advertise vision. */
  | "model_lacks_vision"
  /**
   * Model advertises vision, but Pure image→prompt attach / first usable
   * ingest is not wired yet — eligible ≠ implemented.
   */
  | "eligible_not_wired"
  /** Bytes too large for first-batch attach budget. */
  | "oversize";

export type LoopImageVisionPreflight = {
  format: LoopMaterialFormatClassification;
  visionGate: LoopImageVisionGate;
  /** Always unsupported until image ingest is implemented. */
  parseLevel: "unsupported";
  reason: string;
  /** Soft budget for first-batch thumbnails / future attach (5 MiB). */
  maxBytes: number;
};

export const LOOP_IMAGE_MATERIAL_MAX_BYTES = 5 * 1024 * 1024;

export function evaluateImageMaterialCapability(input: {
  mimeType?: string | null;
  fileName?: string | null;
  sizeBytes?: number | null;
  /** Explicit model vision capability — never invent from brand/name. */
  supportsVision?: boolean | null;
}): LoopImageVisionPreflight {
  const format = classifyLoopMaterialFormat({
    ...(input.mimeType !== undefined ? { mimeType: input.mimeType } : {}),
    ...(input.fileName !== undefined ? { fileName: input.fileName } : {}),
  });
  const size =
    typeof input.sizeBytes === "number" && Number.isFinite(input.sizeBytes)
      ? input.sizeBytes
      : null;
  const supportsVision = input.supportsVision === true;

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
        "Image kept as material card; active model lacks vision capability — parseLevel=unsupported (not silently dropped)",
      maxBytes: LOOP_IMAGE_MATERIAL_MAX_BYTES,
    };
  }

  return {
    format,
    visionGate: "eligible_not_wired",
    parseLevel: "unsupported",
    reason:
      "Model advertises vision, but Pure image→prompt attach is not wired yet — eligible_not_wired (unsupported ≠ discarded)",
    maxBytes: LOOP_IMAGE_MATERIAL_MAX_BYTES,
  };
}
