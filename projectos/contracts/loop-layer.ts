/**
 * Loop Graph visual stage layers — frontend presentation only.
 * Layers wrap duty nodes without changing layout; ignored by compile/runtime.
 */

import { z } from "zod";

export const LOOP_LAYER_PADDING = 16;
export const LOOP_LAYER_TITLE_BAR_HEIGHT = 28;
export const LOOP_LAYER_LIMIT = 32;

/** Soft stage palette — cycled on create. */
export const LOOP_LAYER_COLOR_KEYS = [
  "coral",
  "sand",
  "sage",
  "sky",
  "lilac",
  "slate",
] as const;

export type LoopLayerColorKey = (typeof LOOP_LAYER_COLOR_KEYS)[number];

export const LoopLayerColorKeySchema = z.enum(LOOP_LAYER_COLOR_KEYS);

export const LoopLayerSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().trim().min(1).max(120),
    colorKey: LoopLayerColorKeySchema,
    memberNodeIds: z.array(z.string().min(1)).max(128),
    createdAt: z.string().min(1).optional(),
  })
  .strict();

export type LoopLayer = z.infer<typeof LoopLayerSchema>;

export interface LoopLayerRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LoopLayerNodeBounds {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

function cryptoRandomId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export function createLoopLayerId(): string {
  return `ly_${cryptoRandomId()}`;
}

export function nextLoopLayerTitle(seq: number): string {
  return `Stage ${Math.max(1, seq)}`;
}

export function nextLoopLayerColorKey(existing: LoopLayer[]): LoopLayerColorKey {
  const used = existing.length % LOOP_LAYER_COLOR_KEYS.length;
  return LOOP_LAYER_COLOR_KEYS[used]!;
}

/** Normalize any two corners into a positive-size rect. */
export function normalizeMarqueeRect(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): LoopLayerRect {
  const left = Math.min(x0, x1);
  const top = Math.min(y0, y1);
  const right = Math.max(x0, x1);
  const bottom = Math.max(y0, y1);
  return {
    x: left,
    y: top,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
}

/** Hit test: node center must fall inside the marquee (inclusive). */
export function nodeCenterInRect(
  node: LoopLayerNodeBounds,
  rect: LoopLayerRect,
): boolean {
  if (rect.width <= 0 || rect.height <= 0) return false;
  const cx = node.x + node.width / 2;
  const cy = node.y + node.height / 2;
  return (
    cx >= rect.x &&
    cy >= rect.y &&
    cx <= rect.x + rect.width &&
    cy <= rect.y + rect.height
  );
}

export function pickNodesInMarquee(
  nodes: LoopLayerNodeBounds[],
  rect: LoopLayerRect,
): string[] {
  return nodes.filter((node) => nodeCenterInRect(node, rect)).map((node) => node.id);
}

/**
 * Formal layer frame: member AABB + padding + title bar.
 * Returns null when there are no members.
 */
export function computeLoopLayerFrameBounds(
  memberBounds: LoopLayerNodeBounds[],
  options?: { padding?: number; titleBarHeight?: number },
): LoopLayerRect | null {
  if (memberBounds.length === 0) return null;
  const padding = options?.padding ?? LOOP_LAYER_PADDING;
  const titleBar = options?.titleBarHeight ?? LOOP_LAYER_TITLE_BAR_HEIGHT;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const rect of memberBounds) {
    minX = Math.min(minX, rect.x);
    minY = Math.min(minY, rect.y);
    maxX = Math.max(maxX, rect.x + rect.width);
    maxY = Math.max(maxY, rect.y + rect.height);
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;
  return {
    x: minX - padding,
    y: minY - padding - titleBar,
    width: maxX - minX + padding * 2,
    height: maxY - minY + padding * 2 + titleBar,
  };
}

export function pruneLoopLayerMembers(
  layers: LoopLayer[],
  existingNodeIds: ReadonlySet<string>,
): LoopLayer[] {
  return layers
    .map((layer) => ({
      ...layer,
      memberNodeIds: layer.memberNodeIds.filter((id) => existingNodeIds.has(id)),
    }))
    .filter((layer) => layer.memberNodeIds.length > 0);
}

export type LoopLayerResizeEdge =
  | "n"
  | "e"
  | "s"
  | "w"
  | "ne"
  | "nw"
  | "se"
  | "sw";

/** Apply a resize delta in world space to a formal rect → new marquee rect. */
export function resizeRectFromEdge(
  base: LoopLayerRect,
  edge: LoopLayerResizeEdge,
  world: { x: number; y: number },
): LoopLayerRect {
  let x0 = base.x;
  let y0 = base.y;
  let x1 = base.x + base.width;
  let y1 = base.y + base.height;
  if (edge.includes("w")) x0 = world.x;
  if (edge.includes("e")) x1 = world.x;
  if (edge.includes("n")) y0 = world.y;
  if (edge.includes("s")) y1 = world.y;
  return normalizeMarqueeRect(x0, y0, x1, y1);
}
