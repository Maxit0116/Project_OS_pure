/**
 * Project materials for a bound node / ModelGateway step.
 * Range selection and vision attach must affect what is sent — not UI-only.
 */
import type { LoopTaskMaterial } from "../contracts/loop-task-materials.js";
import type { ModelImagePart } from "../contracts/model-gateway.js";
import {
  materialImagesToGatewayParts,
  resolveLoopVisionCapability,
} from "../contracts/loop-material-vision-capability.js";
import type { ModelProfile } from "../contracts/settings.js";

export type ProjectedNodeMaterials = {
  materials: LoopTaskMaterial[];
  textBundle: string;
  images: ModelImagePart[];
  visionBlocked: boolean;
  visionBlockReason?: string;
};

function materialTouchesNode(
  material: LoopTaskMaterial,
  nodeId: string | undefined,
): boolean {
  if (!nodeId) return true;
  if (!material.bindingNodeIds?.length) return true;
  return material.bindingNodeIds.includes(nodeId);
}

/**
 * Snapshot materials for a node: respects bindingNodeIds, keeps structured
 * textPreview (already selection-shaped), attaches gateway images when vision ok.
 */
export function projectMaterialsForNode(input: {
  materials: LoopTaskMaterial[] | undefined;
  nodeId?: string;
  modelProfile?: ModelProfile | null;
}): ProjectedNodeMaterials {
  const scoped = (input.materials ?? []).filter((material) =>
    materialTouchesNode(material, input.nodeId),
  );
  const vision = resolveLoopVisionCapability(input.modelProfile ?? null);
  const imageMaterials = scoped.filter(
    (material) =>
      material.kind === "image" ||
      (material.mimeType ?? "").startsWith("image/"),
  );
  let visionBlocked = false;
  let visionBlockReason: string | undefined;
  if (imageMaterials.length && !vision.supportsVision) {
    visionBlocked = true;
    visionBlockReason = vision.reason;
  }
  const images =
    vision.supportsVision && !visionBlocked
      ? materialImagesToGatewayParts(
          scoped.filter((m) => m.parseLevel === "vision_attach" || m.parseStatus === "ok"),
        )
      : [];
  const textBundle = scoped
    .map((material) => {
      const selection =
        material.tablePreview != null
          ? ` selection=${JSON.stringify(material.tablePreview)}`
          : material.pdfPreview != null
            ? ` pdf=${JSON.stringify(material.pdfPreview)}`
            : "";
      const body =
        material.textPreview?.trim() ||
        material.parseMessage ||
        `(${material.kind}/${material.parseLevel ?? material.parseStatus})`;
      return `[${material.id} ${material.kind} ${material.purpose}${selection}]\n${body}`;
    })
    .join("\n\n");
  return {
    materials: scoped,
    textBundle,
    images,
    visionBlocked,
    ...(visionBlockReason ? { visionBlockReason } : {}),
  };
}
