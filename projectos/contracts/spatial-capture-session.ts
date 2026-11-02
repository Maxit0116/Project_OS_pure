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
import {
  MAX_STENCILS_PER_REGION,
  StencilPlacementSchema,
} from "./ui-stencil.js";

export const SpatialCaptureSessionVersionSchema = z.literal("0.1.0");

/** Folders only appear in the Spatial Captures main grid when they have ≥ this many members. */
export const MIN_VISIBLE_CAPTURE_FOLDER_MEMBERS = 2;

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
    tool: z.enum(["arrow", "draw", "stencil"]).default("arrow"),
    arrows: z.array(SpatialCaptureArrowSchema).max(200).default([]),
    stencils: z
      .array(StencilPlacementSchema)
      .max(MAX_STENCILS_PER_REGION)
      .default([]),
    /**
     * Full-screenshot region created by dropping a stencil on empty canvas.
     * Capture/agent still use the full frame; selection chrome is not shown.
     */
    hideSelectionChrome: z.boolean().optional(),
  })
  .strict();

export const SpatialCaptureFolderSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1).max(120),
    memberSessionIds: z.array(z.string().min(1)).max(200),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
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
    /** Nullish / missing → Misc (or singleton folder shown in Misc). */
    folderId: z.string().min(1).optional(),
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
    folderId: z.string().min(1).optional(),
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
    folders: z.array(SpatialCaptureFolderSchema).max(500).default([]),
  })
  .strict();

export const SpatialCapturePlacementSchema = z.discriminatedUnion("mode", [
  z
    .object({
      mode: z.literal("misc"),
      title: z.string().max(240),
    })
    .strict(),
  z
    .object({
      mode: z.literal("new_folder"),
      folderName: z.string().min(1).max(120),
      title: z.string().max(240),
    })
    .strict(),
  z
    .object({
      mode: z.literal("join_folder"),
      folderId: z.string().min(1),
      title: z.string().max(240),
    })
    .strict(),
  z
    .object({
      mode: z.literal("merge_misc"),
      otherSessionId: z.string().min(1),
      folderName: z.string().min(1).max(120),
      title: z.string().max(240),
      otherTitle: z.string().max(240).optional(),
    })
    .strict(),
]);

export const DeleteSpatialCaptureFolderOptionsSchema = z
  .object({
    /** When true, also delete every member workspace. Default: dissolve folder → Misc. */
    cascade: z.boolean().default(false),
  })
  .strict();

/** Merge source folder into target; optional rename of the surviving folder. */
export const MergeSpatialCaptureFoldersOptionsSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
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
export type SpatialCaptureFolder = z.infer<typeof SpatialCaptureFolderSchema>;
export type SpatialCaptureSession = z.infer<typeof SpatialCaptureSessionSchema>;
export type SpatialCaptureSessionHead = z.infer<
  typeof SpatialCaptureSessionHeadSchema
>;
export type SpatialCaptureSessionIndex = z.infer<
  typeof SpatialCaptureSessionIndexSchema
>;
export type SpatialCapturePlacement = z.infer<
  typeof SpatialCapturePlacementSchema
>;
export type DeleteSpatialCaptureFolderOptions = z.infer<
  typeof DeleteSpatialCaptureFolderOptionsSchema
>;
export type MergeSpatialCaptureFoldersOptions = z.infer<
  typeof MergeSpatialCaptureFoldersOptionsSchema
>;

export function isVisibleCaptureFolder(
  folder: Pick<SpatialCaptureFolder, "memberSessionIds">,
): boolean {
  return folder.memberSessionIds.length >= MIN_VISIBLE_CAPTURE_FOLDER_MEMBERS;
}

/**
 * Main grid shows only folders with ≥2 members.
 * Misc = every head not currently inside a visible folder.
 */
export function partitionSpatialCaptures(
  heads: SpatialCaptureSessionHead[],
  folders: SpatialCaptureFolder[],
): {
  folders: SpatialCaptureFolder[];
  misc: SpatialCaptureSessionHead[];
} {
  const visibleFolders = folders
    .filter(isVisibleCaptureFolder)
    .slice()
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const visibleMemberIds = new Set(
    visibleFolders.flatMap((folder) => folder.memberSessionIds),
  );
  const misc = heads
    .filter((head) => !visibleMemberIds.has(head.id))
    .slice()
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return { folders: visibleFolders, misc };
}

/** Default iteration title: `{folderName}-{n}` based on existing titles in the folder. */
export function nextCaptureVersionTitle(
  folderName: string,
  existingTitles: readonly string[],
): string {
  const trimmed = folderName.trim() || "Capture";
  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^${escaped}-(\\d+)$`, "i");
  let max = 0;
  for (const title of existingTitles) {
    const match = title.trim().match(re);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `${trimmed}-${max + 1}`;
}

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
    ...(session.folderId ? { folderId: session.folderId } : {}),
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
