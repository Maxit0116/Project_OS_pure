import type { ArchitectureLayerBandLayout } from './layeredArchitectureLayout'
import { NODE_HEIGHT, NODE_WIDTH } from './autoGridLayout'

/** Matches layeredArchitectureLayout band chrome — keep in sync for slack checks. */
export const BAND_HEADER_HEIGHT = 38
export const BAND_PADDING = 18
const NODE_GAP_X = 22
const NODE_GAP_Y = 16

export interface ConfiguredArchitectureLayer {
  id: string
  label: string
  description: string
  order?: number
}

/**
 * Merge preserved full-map layer bands with the active layout's bands.
 * Active geometry wins for shared ids; new active ids are appended so navigating
 * from a smaller layer set to a larger one never drops bands.
 */
export function mergeFullLayerBands(
  fullBands: ArchitectureLayerBandLayout[],
  activeBands: ArchitectureLayerBandLayout[],
): ArchitectureLayerBandLayout[] {
  if (fullBands.length === 0) {
    return activeBands
  }
  if (activeBands.length === 0) {
    return fullBands
  }

  const activeById = new Map(activeBands.map((band) => [band.id, band]))
  const merged: ArchitectureLayerBandLayout[] = []
  const seen = new Set<string>()

  for (const band of fullBands) {
    seen.add(band.id)
    merged.push(activeById.get(band.id) ?? band)
  }
  for (const band of activeBands) {
    if (seen.has(band.id)) continue
    seen.add(band.id)
    merged.push(band)
  }
  return merged
}

export function layerIdsMissingBands(
  nodeLayers: Iterable<string | undefined>,
  bandIds: Iterable<string>,
): string[] {
  const bands = new Set(bandIds)
  const missing = new Set<string>()
  for (const layer of nodeLayers) {
    if (layer && !bands.has(layer)) missing.add(layer)
  }
  return [...missing].sort()
}

function refitBandToMemberNodes(
  band: ArchitectureLayerBandLayout,
  memberNodeIds: string[],
  positionsById: Record<string, { x: number; y: number }>,
): ArchitectureLayerBandLayout | null {
  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY

  for (const id of memberNodeIds) {
    const position = positionsById[id]
    if (!position) continue
    minX = Math.min(minX, position.x)
    maxX = Math.max(maxX, position.x + NODE_WIDTH)
    minY = Math.min(minY, position.y)
    maxY = Math.max(maxY, position.y + NODE_HEIGHT)
  }

  if (minX === Number.POSITIVE_INFINITY) {
    return null
  }

  return {
    ...band,
    position: {
      x: minX - BAND_PADDING,
      y: minY - BAND_HEADER_HEIGHT - BAND_PADDING,
    },
    width: maxX - minX + BAND_PADDING * 2,
    height: maxY - minY + BAND_HEADER_HEIGHT + BAND_PADDING * 2,
  }
}

/**
 * Keep only bands for layers that currently have visible nodes, and refit each
 * band to the member union so stale preserved geometry cannot leave large gaps.
 */
export function sanitizeLayerBandsForNodes(options: {
  bands: ArchitectureLayerBandLayout[]
  nodes: Array<{ id: string; layer?: string }>
  positionsById: Record<string, { x: number; y: number }>
  configuredLayers?: ConfiguredArchitectureLayer[]
}): ArchitectureLayerBandLayout[] {
  const membersByLayer = new Map<string, string[]>()
  for (const node of options.nodes) {
    if (!node.layer) continue
    const list = membersByLayer.get(node.layer) ?? []
    list.push(node.id)
    membersByLayer.set(node.layer, list)
  }

  if (membersByLayer.size === 0) {
    return []
  }

  const bandById = new Map(options.bands.map((band) => [band.id, band]))
  const configuredById = new Map(
    (options.configuredLayers ?? []).map((layer) => [layer.id, layer]),
  )

  const activeLayerIds = [...membersByLayer.keys()].sort((a, b) => {
    const orderA = configuredById.get(a)?.order ?? Number.MAX_SAFE_INTEGER
    const orderB = configuredById.get(b)?.order ?? Number.MAX_SAFE_INTEGER
    return orderA - orderB || a.localeCompare(b)
  })

  const sanitized: ArchitectureLayerBandLayout[] = []
  for (const layerId of activeLayerIds) {
    const memberIds = (membersByLayer.get(layerId) ?? []).filter(
      (id) => options.positionsById[id] !== undefined,
    )
    if (memberIds.length === 0) continue

    const source = bandById.get(layerId)
    const meta = configuredById.get(layerId)
    const seed: ArchitectureLayerBandLayout = source ?? {
      id: layerId,
      label: meta?.label ?? layerId.replace(/_/g, ' '),
      description: meta?.description ?? 'Architecture layer',
      position: { x: 0, y: 0 },
      width: 0,
      height: 0,
    }
    const refitted = refitBandToMemberNodes(seed, memberIds, options.positionsById)
    if (refitted) {
      sanitized.push(refitted)
    }
  }

  return sanitized
}

export interface RenderableLayerBand extends ArchitectureLayerBandLayout {
  opacity: number
}

/** Final render pass: drop orphan layers, refit geometry, apply optional fade opacity. */
export function resolveRenderableLayerBands(options: {
  sourceBands: ArchitectureLayerBandLayout[]
  nodes: Array<{ id: string; layer?: string }>
  positionsById: Record<string, { x: number; y: number }>
  configuredLayers?: ConfiguredArchitectureLayer[]
  opacityByBandId?: ReadonlyMap<string, number> | Record<string, number>
  nodeOpacityById?: Record<string, number>
  minOpacity?: number
}): RenderableLayerBand[] {
  const minOpacity = options.minOpacity ?? 0.01
  const visibleNodes = options.nodeOpacityById
    ? options.nodes.filter(
        (node) => (options.nodeOpacityById![node.id] ?? 1) > minOpacity,
      )
    : options.nodes

  const opacityLookup =
    options.opacityByBandId instanceof Map
      ? options.opacityByBandId
      : new Map(Object.entries(options.opacityByBandId ?? {}))

  return sanitizeLayerBandsForNodes({
    bands: options.sourceBands,
    nodes: visibleNodes,
    positionsById: options.positionsById,
    configuredLayers: options.configuredLayers,
  })
    .map((band) => ({
      ...band,
      opacity: opacityLookup.get(band.id) ?? 1,
    }))
    .filter((band) => band.opacity > minOpacity)
}

export interface BandFitDiagnostics {
  bandId: string
  memberCount: number
  orphan: boolean
  staleVsLayout: boolean
  width: number
  height: number
  contentWidth: number
  contentHeight: number
  tightWidth: number
  tightHeight: number
  slackWidth: number
  slackHeight: number
  expectedMaxGapX: number
  expectedMaxGapY: number
}

export function diagnoseLayerBands(options: {
  bands: ArchitectureLayerBandLayout[]
  layoutBandIds: Iterable<string>
  nodes: Array<{ id: string; layer?: string }>
  positionsById: Record<string, { x: number; y: number }>
}): BandFitDiagnostics[] {
  const layoutIds = new Set(options.layoutBandIds)
  const membersByLayer = new Map<string, string[]>()
  for (const node of options.nodes) {
    if (!node.layer) continue
    const list = membersByLayer.get(node.layer) ?? []
    list.push(node.id)
    membersByLayer.set(node.layer, list)
  }

  return options.bands.map((band) => {
    const memberIds = membersByLayer.get(band.id) ?? []
    let minX = Number.POSITIVE_INFINITY
    let maxX = Number.NEGATIVE_INFINITY
    let minY = Number.POSITIVE_INFINITY
    let maxY = Number.NEGATIVE_INFINITY
    for (const id of memberIds) {
      const pos = options.positionsById[id]
      if (!pos) continue
      minX = Math.min(minX, pos.x)
      maxX = Math.max(maxX, pos.x + NODE_WIDTH)
      minY = Math.min(minY, pos.y)
      maxY = Math.max(maxY, pos.y + NODE_HEIGHT)
    }
    const hasMembers = minX !== Number.POSITIVE_INFINITY
    const tightWidth = hasMembers ? maxX - minX + BAND_PADDING * 2 : 0
    const tightHeight = hasMembers
      ? maxY - minY + BAND_HEADER_HEIGHT + BAND_PADDING * 2
      : 0
    const contentWidth = Math.max(0, band.width - BAND_PADDING * 2)
    const contentHeight = Math.max(0, band.height - BAND_HEADER_HEIGHT - BAND_PADDING * 2)
    return {
      bandId: band.id,
      memberCount: memberIds.length,
      orphan: memberIds.length === 0,
      staleVsLayout: !layoutIds.has(band.id),
      width: band.width,
      height: band.height,
      contentWidth,
      contentHeight,
      tightWidth,
      tightHeight,
      slackWidth: hasMembers ? band.width - tightWidth : band.width,
      slackHeight: hasMembers ? band.height - tightHeight : band.height,
      expectedMaxGapX: NODE_GAP_X,
      expectedMaxGapY: NODE_GAP_Y,
    }
  })
}
