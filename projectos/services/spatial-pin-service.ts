import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

import {
  headFromSpatialPin,
  isScreenLikeSurface,
  isWebSurface,
  normalizeSpatialPinUrl,
  SpatialPinIndexSchema,
  SpatialPinSchema,
  type LocationHint,
  type ResolvedSpatialPin,
  type SpatialPin,
  type SpatialPinConfidence,
  type SpatialPinHead,
  type SpatialPinIndex,
  type ResolveState,
} from "../contracts/spatial-pin.js";

const SPATIAL_PINS_DIR = join(".projectos", "spatial-pins");
const INDEX_PATH = join(SPATIAL_PINS_DIR, "index.json");
const ASSETS_DIR = join(SPATIAL_PINS_DIR, "assets");

function pinFilePath(pinId: string): string {
  return join(SPATIAL_PINS_DIR, `${pinId}.json`);
}

function ensurePinsDir(workspaceRoot: string): string {
  const dir = join(workspaceRoot, SPATIAL_PINS_DIR);
  mkdirSync(dir, { recursive: true });
  mkdirSync(join(workspaceRoot, ASSETS_DIR), { recursive: true });
  return dir;
}

function readIndex(workspaceRoot: string): SpatialPinIndex {
  const indexPath = join(workspaceRoot, INDEX_PATH);
  if (!existsSync(indexPath)) {
    return { version: "0.1.0", heads: [] };
  }
  try {
    return SpatialPinIndexSchema.parse(
      JSON.parse(readFileSync(indexPath, "utf8")),
    );
  } catch {
    return { version: "0.1.0", heads: [] };
  }
}

function writeIndex(workspaceRoot: string, index: SpatialPinIndex): void {
  ensurePinsDir(workspaceRoot);
  const parsed = SpatialPinIndexSchema.parse(index);
  writeFileSync(
    join(workspaceRoot, INDEX_PATH),
    `${JSON.stringify(parsed, null, 2)}\n`,
    "utf8",
  );
}

function upsertHead(
  index: SpatialPinIndex,
  head: SpatialPinHead,
): SpatialPinIndex {
  const heads = index.heads.filter((item) => item.id !== head.id);
  return {
    ...index,
    heads: [head, ...heads].sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    ),
  };
}

export function listSpatialPinHeads(workspaceRoot: string): SpatialPinHead[] {
  return [...readIndex(workspaceRoot).heads].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );
}

export function getSpatialPin(
  workspaceRoot: string,
  pinId: string,
): SpatialPin | null {
  const filePath = join(workspaceRoot, pinFilePath(pinId));
  if (!existsSync(filePath)) return null;
  try {
    return SpatialPinSchema.parse(JSON.parse(readFileSync(filePath, "utf8")));
  } catch {
    return null;
  }
}

export function upsertSpatialPin(
  workspaceRoot: string,
  pin: SpatialPin,
): SpatialPin {
  const parsed = SpatialPinSchema.parse({
    ...pin,
    location: {
      ...pin.location,
      url: normalizeSpatialPinUrl(pin.location.url),
    },
    updatedAt: pin.updatedAt || new Date().toISOString(),
  });
  ensurePinsDir(workspaceRoot);
  writeFileSync(
    join(workspaceRoot, pinFilePath(parsed.id)),
    `${JSON.stringify(parsed, null, 2)}\n`,
    "utf8",
  );
  writeIndex(
    workspaceRoot,
    upsertHead(readIndex(workspaceRoot), headFromSpatialPin(parsed)),
  );
  return parsed;
}

export function deleteSpatialPin(
  workspaceRoot: string,
  pinId: string,
): boolean {
  const filePath = join(workspaceRoot, pinFilePath(pinId));
  const assetPath = join(workspaceRoot, ASSETS_DIR, `${pinId}.png`);
  let removed = false;
  if (existsSync(filePath)) {
    unlinkSync(filePath);
    removed = true;
  }
  if (existsSync(assetPath)) {
    unlinkSync(assetPath);
  }
  const index = readIndex(workspaceRoot);
  writeIndex(workspaceRoot, {
    ...index,
    heads: index.heads.filter((head) => head.id !== pinId),
  });
  return removed;
}

export function saveSpatialPinSnapshot(
  workspaceRoot: string,
  pinId: string,
  pngBytes: Buffer,
): string {
  ensurePinsDir(workspaceRoot);
  const relative = join(ASSETS_DIR, `${pinId}.png`);
  const absolute = join(workspaceRoot, relative);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, pngBytes);
  return relative.replace(/\\/g, "/");
}

function urlsMatch(a: string, b: string): boolean {
  return normalizeSpatialPinUrl(a) === normalizeSpatialPinUrl(b);
}

function scorePin(
  pin: SpatialPin,
  hint: LocationHint,
): { confidence: SpatialPinConfidence; method: ResolveState["method"] } | null {
  const pinSurface = pin.location.surface;
  const hintSurface = hint.surface ?? pinSurface;

  // Screen / workspace / terminal pins: match by synthetic URL or workspace path.
  if (isScreenLikeSurface(pinSurface) || isScreenLikeSurface(hintSurface)) {
    if (
      pin.location.workspacePath &&
      hint.workspacePath &&
      pin.location.workspacePath === hint.workspacePath
    ) {
      return { confidence: "approx", method: "url_only" };
    }
    if (urlsMatch(pin.location.url, hint.url)) {
      return { confidence: "snapshot_only", method: "snapshot" };
    }
    if (
      isScreenLikeSurface(pinSurface) &&
      isScreenLikeSurface(hintSurface) &&
      !hint.url.startsWith("http")
    ) {
      // Same project session listing screen pins without exact URL.
      return { confidence: "snapshot_only", method: "snapshot" };
    }
    return null;
  }

  if (!urlsMatch(pin.location.url, hint.url)) {
    const pinRoute = pin.location.routePath;
    const hintRoute = hint.routePath;
    if (!pinRoute || !hintRoute || pinRoute !== hintRoute) {
      return null;
    }
  }

  if (
    pin.location.selector &&
    hint.selector &&
    pin.location.selector === hint.selector
  ) {
    return { confidence: "exact", method: "selector" };
  }

  if (
    pin.location.textHint &&
    hint.textHint &&
    pin.location.textHint.trim().toLowerCase() ===
      hint.textHint.trim().toLowerCase()
  ) {
    return { confidence: "approx", method: "text_hint" };
  }

  if (
    pin.location.visualHash &&
    hint.visualHash &&
    pin.location.visualHash === hint.visualHash
  ) {
    return { confidence: "approx", method: "visual_hash" };
  }

  if (pin.location.selector && !hint.selector) {
    return { confidence: "snapshot_only", method: "url_only" };
  }

  if (!pin.location.selector) {
    return { confidence: "snapshot_only", method: "snapshot" };
  }

  if (isWebSurface(pinSurface)) {
    return { confidence: "approx", method: "url_only" };
  }

  return { confidence: "approx", method: "url_only" };
}

export function resolveSpatialPinList(
  pins: readonly SpatialPin[],
  hint: LocationHint,
): ResolvedSpatialPin[] {
  const normalizedHint: LocationHint = {
    ...hint,
    url: normalizeSpatialPinUrl(hint.url),
  };
  const results: ResolvedSpatialPin[] = [];
  for (const pin of pins) {
    const scored = scorePin(pin, normalizedHint);
    if (!scored) continue;
    const now = new Date().toISOString();
    const resolve: ResolveState = {
      confidence: scored.confidence,
      method: scored.method,
      lastRect: normalizedHint.viewportRect ?? pin.resolve?.lastRect,
      lastResolvedAt: now,
    };
    const updated: SpatialPin = {
      ...pin,
      resolve,
      status:
        pin.status === "orphaned" && scored.confidence !== "snapshot_only"
          ? "submitted"
          : pin.status,
    };
    results.push({
      pin: updated,
      confidence: scored.confidence,
      method: scored.method,
      rect: resolve.lastRect,
    });
  }
  return results.sort((a, b) => {
    const rank = { exact: 0, approx: 1, snapshot_only: 2 } as const;
    return rank[a.confidence] - rank[b.confidence];
  });
}

export function resolveSpatialPins(
  workspaceRoot: string,
  hint: LocationHint,
): ResolvedSpatialPin[] {
  const pins: SpatialPin[] = [];
  for (const head of listSpatialPinHeads(workspaceRoot)) {
    const pin = getSpatialPin(workspaceRoot, head.id);
    if (pin) pins.push(pin);
  }
  return resolveSpatialPinList(pins, hint);
}

export function newSpatialPinId(): string {
  return randomUUID();
}
