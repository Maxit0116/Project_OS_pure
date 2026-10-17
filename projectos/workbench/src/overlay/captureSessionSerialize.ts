import type {
  SpatialCaptureArrow,
  SpatialCaptureRegion,
  SpatialCaptureSession,
  SpatialCaptureViewport,
} from '@contracts/spatial-capture-session'
import type { LocationKey } from '@contracts/spatial-pin'
import {
  isCompleteCaptureRegion,
  type OverlayArrow,
  type OverlayRegion,
} from './overlayRegions'

export function overlayArrowToCapture(
  arrow: OverlayArrow,
): SpatialCaptureArrow {
  return {
    id: arrow.id,
    index: arrow.index,
    color: arrow.color,
    anchor: arrow.anchor,
    head: arrow.head,
    tail: arrow.tail,
    composeAttach: arrow.composeAttach,
    prompt: arrow.prompt,
    pinId: arrow.pinId,
    status: arrow.status,
    ...(arrow.runId ? { runId: arrow.runId } : {}),
  }
}

export function overlayRegionToCapture(
  region: OverlayRegion,
): SpatialCaptureRegion {
  return {
    id: region.id,
    captureRect: region.captureRect,
    mode: region.mode,
    regionPrompt: region.regionPrompt,
    drawStrokes: region.drawStrokes,
    flowComplete: region.flowComplete,
    showAnchors: region.showAnchors,
    tool: region.tool,
    arrows: region.arrows.map(overlayArrowToCapture),
    ...(region.snapshotAssetPath
      ? { snapshotAssetPath: region.snapshotAssetPath }
      : {}),
  }
}

export function captureArrowToOverlay(
  arrow: SpatialCaptureArrow,
): OverlayArrow {
  return {
    id: arrow.id,
    index: arrow.index,
    color: arrow.color,
    anchor: arrow.anchor,
    head: arrow.head,
    tail: arrow.tail,
    composeAttach: arrow.composeAttach,
    prompt: arrow.prompt,
    pinId: arrow.pinId,
    status: arrow.status,
    ...(arrow.runId ? { runId: arrow.runId } : {}),
  }
}

export function captureRegionToOverlay(
  region: SpatialCaptureRegion,
): OverlayRegion {
  return {
    id: region.id,
    captureRect: region.captureRect,
    mode: region.mode,
    regionPrompt: region.regionPrompt ?? '',
    drawStrokes: region.drawStrokes ?? [],
    flowComplete: region.flowComplete ?? false,
    showAnchors: region.showAnchors ?? false,
    tool: region.tool ?? 'arrow',
    arrows: (region.arrows ?? []).map(captureArrowToOverlay),
    ...(region.snapshotAssetPath
      ? { snapshotAssetPath: region.snapshotAssetPath }
      : {}),
  }
}

export function buildCaptureSessionFromOverlay(input: {
  id: string
  projectId: string
  location: LocationKey
  viewport: SpatialCaptureViewport
  regions: OverlayRegion[]
  backdropAssetPath?: string
  createdAt?: string
  title?: string
}): SpatialCaptureSession {
  const now = new Date().toISOString()
  const regions = input.regions
    .filter(isCompleteCaptureRegion)
    .map(overlayRegionToCapture)
  const firstPrompt = regions
    .flatMap((r) => r.arrows)
    .map((a) => a.prompt.trim())
    .find((p) => p.length > 0)
  return {
    version: '0.1.0',
    id: input.id,
    projectId: input.projectId,
    createdAt: input.createdAt ?? now,
    updatedAt: now,
    status: 'archived',
    location: input.location,
    viewport: input.viewport,
    regions,
    ...(input.backdropAssetPath
      ? { backdropAssetPath: input.backdropAssetPath }
      : {}),
    title:
      input.title?.trim() ||
      firstPrompt?.slice(0, 60) ||
      `Capture · ${regions.length} region${regions.length === 1 ? '' : 's'}`,
  }
}
