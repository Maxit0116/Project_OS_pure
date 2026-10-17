import { z } from "zod";
import {
  AnnotationAnchorSchema,
  AnnotationPointUnboundedSchema,
  AnnotationStrokeSchema,
  LocationKeySchema,
  ScreenRectSchema,
  SpatialPinModeSchema,
  SpatialPinVersionSchema,
} from "./spatial-pin.js";

export const SpatialCaptureSessionVersionSchema = z.literal("0.1.0");

export const SpatialCaptureSessionStatusSchema = z.enum(["open", "archived"]);

export const SpatialCaptureArrowStatusSchema = z.enum([
  "draft",
  "submitting",
  "submitted",
  "error",
]);

export const SpatialCaptureViewportSchema = z
  .object({
    width: z.number().positive(),
    height: z.number().positive(),
  })
  .strict();

export const SpatialCaptureArrowSchema = z
  .object({
    id: z.string().min(1),
    index: z.number().int().positive().max(200),
    color: z.string().min(1).max(32),
    anchor: AnnotationAnchorSchema,
    head: AnnotationPointUnboundedSchema,
    tail: AnnotationPointUnboundedSchema,
    composeAttach: AnnotationAnchorSchema,
    prompt: z.string().max(16_000),
    pinId: z.string().min(1),
    runId: z.string().min(1).optional(),
    status: SpatialCaptureArrowStatusSchema,
  })
  .strict();

export const SpatialCaptureRegionSchema = z
  .object({
    id: z.string().min(1),
    captureRect: ScreenRectSchema,
    mode: SpatialPinModeSchema,
    regionPrompt: z.string().max(16_000).default(""),
    drawStrokes: z.array(AnnotationStrokeSchema).max(200).default([]),
    snapshotAssetPath: z.string().max(1024).optional(),
    flowComplete: z.boolean().default(false),
    showAnchors: z.boolean().default(false),
    tool: z.enum(["arrow", "draw"]).default("arrow"),
    arrows: z.array(SpatialCaptureArrowSchema).max(200).default([]),
  })
  .strict();

export const SpatialCaptureSessionSchema = z
  .object({
    version: SpatialCaptureSessionVersionSchema,
    id: z.string().min(1),
    projectId: z.string().min(1),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
    status: SpatialCaptureSessionStatusSchema,
    title: z.string().max(240).optional(),
    location: LocationKeySchema,
    viewport: SpatialCaptureViewportSchema,
    backdropAssetPath: z.string().max(1024).optional(),
    regions: z.array(SpatialCaptureRegionSchema).max(100),
  })
  .strict();

export const SpatialCaptureSessionHeadSchema = z
  .object({
    id: z.string().min(1),
    projectId: z.string().min(1),
    status: SpatialCaptureSessionStatusSchema,
    title: z.string().max(240).optional(),
    updatedAt: z.string().min(1),
    createdAt: z.string().min(1),
    regionCount: z.number().int().nonnegative(),
    runningCount: z.number().int().nonnegative(),
    thumbnailAssetPath: z.string().max(1024).optional(),
  })
  .strict();

export const SpatialCaptureSessionIndexSchema = z
  .object({
    version: SpatialCaptureSessionVersionSchema,
    heads: z.array(SpatialCaptureSessionHeadSchema),
  })
  .strict();

export type SpatialCaptureSessionVersion = z.infer<
  typeof SpatialCaptureSessionVersionSchema
>;
export type SpatialCaptureSessionStatus = z.infer<
  typeof SpatialCaptureSessionStatusSchema
>;
export type SpatialCaptureArrowStatus = z.infer<
  typeof SpatialCaptureArrowStatusSchema
>;
export type SpatialCaptureViewport = z.infer<
  typeof SpatialCaptureViewportSchema
>;
export type SpatialCaptureArrow = z.infer<typeof SpatialCaptureArrowSchema>;
export type SpatialCaptureRegion = z.infer<typeof SpatialCaptureRegionSchema>;
export type SpatialCaptureSession = z.infer<typeof SpatialCaptureSessionSchema>;
export type SpatialCaptureSessionHead = z.infer<
  typeof SpatialCaptureSessionHeadSchema
>;
export type SpatialCaptureSessionIndex = z.infer<
  typeof SpatialCaptureSessionIndexSchema
>;

export function headFromSpatialCaptureSession(
  session: SpatialCaptureSession,
): SpatialCaptureSessionHead {
  // UI hint: submitting, or submitted with a run still attached.
  let runningCount = 0;
  for (const region of session.regions) {
    for (const arrow of region.arrows) {
      if (arrow.status === "submitting") runningCount += 1;
      else if (arrow.status === "submitted" && arrow.runId) runningCount += 1;
    }
  }

  const firstPrompt = session.regions
    .flatMap((r) => r.arrows)
    .map((a) => a.prompt.trim())
    .find((p) => p.length > 0);

  const thumbnailAssetPath =
    session.backdropAssetPath ??
    session.regions.find((r) => r.snapshotAssetPath)?.snapshotAssetPath;

  return {
    id: session.id,
    projectId: session.projectId,
    status: session.status,
    title:
      session.title?.trim() ||
      firstPrompt?.slice(0, 60) ||
      `Capture · ${session.regions.length} region${session.regions.length === 1 ? "" : "s"}`,
    updatedAt: session.updatedAt,
    createdAt: session.createdAt,
    regionCount: session.regions.length,
    runningCount,
    ...(thumbnailAssetPath ? { thumbnailAssetPath } : {}),
  };
}

export function createEmptySpatialCaptureSession(input: {
  id: string;
  projectId: string;
  location: z.infer<typeof LocationKeySchema>;
  viewport: SpatialCaptureViewport;
  now?: string;
}): SpatialCaptureSession {
  const now = input.now ?? new Date().toISOString();
  return {
    version: "0.1.0",
    id: input.id,
    projectId: input.projectId,
    createdAt: now,
    updatedAt: now,
    status: "archived",
    location: input.location,
    viewport: input.viewport,
    regions: [],
  };
}

/** Re-export pin version for asset path helpers that share spatial-pins assets. */
export { SpatialPinVersionSchema };
