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
  headFromSpatialCaptureSession,
  SpatialCaptureSessionIndexSchema,
  SpatialCaptureSessionSchema,
  type SpatialCaptureSession,
  type SpatialCaptureSessionHead,
  type SpatialCaptureSessionIndex,
} from "../contracts/spatial-capture-session.js";
import { getSpatialPin } from "./spatial-pin-service.js";

const CAPTURES_DIR = join(".projectos", "spatial-captures");
const INDEX_PATH = join(CAPTURES_DIR, "index.json");
const ASSETS_DIR = join(CAPTURES_DIR, "assets");

export class SpatialCaptureSessionError extends Error {
  readonly code: "not_found" | "running" | "invalid";

  constructor(code: "not_found" | "running" | "invalid", message: string) {
    super(message);
    this.name = "SpatialCaptureSessionError";
    this.code = code;
  }
}

function sessionFilePath(sessionId: string): string {
  return join(CAPTURES_DIR, `${sessionId}.json`);
}

function ensureCapturesDir(workspaceRoot: string): string {
  const dir = join(workspaceRoot, CAPTURES_DIR);
  mkdirSync(dir, { recursive: true });
  mkdirSync(join(workspaceRoot, ASSETS_DIR), { recursive: true });
  return dir;
}

function readIndex(workspaceRoot: string): SpatialCaptureSessionIndex {
  const indexPath = join(workspaceRoot, INDEX_PATH);
  if (!existsSync(indexPath)) {
    return { version: "0.1.0", heads: [] };
  }
  try {
    return SpatialCaptureSessionIndexSchema.parse(
      JSON.parse(readFileSync(indexPath, "utf8")),
    );
  } catch {
    return { version: "0.1.0", heads: [] };
  }
}

function writeIndex(
  workspaceRoot: string,
  index: SpatialCaptureSessionIndex,
): void {
  ensureCapturesDir(workspaceRoot);
  const parsed = SpatialCaptureSessionIndexSchema.parse(index);
  writeFileSync(
    join(workspaceRoot, INDEX_PATH),
    `${JSON.stringify(parsed, null, 2)}\n`,
    "utf8",
  );
}

function upsertHead(
  index: SpatialCaptureSessionIndex,
  head: SpatialCaptureSessionHead,
): SpatialCaptureSessionIndex {
  const heads = index.heads.filter((item) => item.id !== head.id);
  return {
    ...index,
    heads: [head, ...heads].sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    ),
  };
}

export function listSpatialCaptureSessions(
  workspaceRoot: string,
): SpatialCaptureSessionHead[] {
  return [...readIndex(workspaceRoot).heads].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );
}

export function getSpatialCaptureSession(
  workspaceRoot: string,
  sessionId: string,
): SpatialCaptureSession | null {
  const filePath = join(workspaceRoot, sessionFilePath(sessionId));
  if (!existsSync(filePath)) return null;
  try {
    return SpatialCaptureSessionSchema.parse(
      JSON.parse(readFileSync(filePath, "utf8")),
    );
  } catch {
    return null;
  }
}

export function upsertSpatialCaptureSession(
  workspaceRoot: string,
  session: SpatialCaptureSession,
): SpatialCaptureSession {
  const parsed = SpatialCaptureSessionSchema.parse({
    ...session,
    updatedAt: session.updatedAt || new Date().toISOString(),
  });
  ensureCapturesDir(workspaceRoot);
  writeFileSync(
    join(workspaceRoot, sessionFilePath(parsed.id)),
    `${JSON.stringify(parsed, null, 2)}\n`,
    "utf8",
  );
  writeIndex(
    workspaceRoot,
    upsertHead(readIndex(workspaceRoot), headFromSpatialCaptureSession(parsed)),
  );
  return parsed;
}

function collectSessionAssetPaths(session: SpatialCaptureSession): string[] {
  const paths = new Set<string>();
  if (session.backdropAssetPath) paths.add(session.backdropAssetPath);
  for (const region of session.regions) {
    if (region.snapshotAssetPath) paths.add(region.snapshotAssetPath);
  }
  return [...paths];
}

const TERMINAL_PIN_STATUSES = new Set(["done", "error", "orphaned", "draft"]);

function sessionHasRunningPins(
  workspaceRoot: string,
  session: SpatialCaptureSession,
): boolean {
  for (const region of session.regions) {
    for (const arrow of region.arrows) {
      if (arrow.status === "submitting") return true;
      if (arrow.status !== "submitted" || !arrow.runId) continue;
      const pin = getSpatialPin(workspaceRoot, arrow.pinId);
      if (!pin) continue;
      // Treat non-terminal submitted pins as in-flight (incl. running / awaiting_review).
      if (!TERMINAL_PIN_STATUSES.has(pin.status)) return true;
    }
  }
  return false;
}

export function deleteSpatialCaptureSession(
  workspaceRoot: string,
  sessionId: string,
): boolean {
  const session = getSpatialCaptureSession(workspaceRoot, sessionId);
  if (!session) return false;
  if (sessionHasRunningPins(workspaceRoot, session)) {
    throw new SpatialCaptureSessionError(
      "running",
      `Cannot delete capture session '${sessionId}' while an agent run is in progress`,
    );
  }

  for (const relative of collectSessionAssetPaths(session)) {
    // Only delete assets under spatial-captures/; pin crops live under spatial-pins/.
    if (!relative.replace(/\\/g, "/").includes("spatial-captures/")) continue;
    const absolute = join(workspaceRoot, relative);
    if (existsSync(absolute)) {
      try {
        unlinkSync(absolute);
      } catch {
        /* ignore */
      }
    }
  }

  const filePath = join(workspaceRoot, sessionFilePath(sessionId));
  if (existsSync(filePath)) {
    unlinkSync(filePath);
  }

  const index = readIndex(workspaceRoot);
  writeIndex(workspaceRoot, {
    ...index,
    heads: index.heads.filter((head) => head.id !== sessionId),
  });
  return true;
}

export function saveSpatialCaptureBackdrop(
  workspaceRoot: string,
  sessionId: string,
  pngBytes: Buffer,
): string {
  ensureCapturesDir(workspaceRoot);
  const relative = join(ASSETS_DIR, `${sessionId}-backdrop.png`);
  const absolute = join(workspaceRoot, relative);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, pngBytes);
  return relative.replace(/\\/g, "/");
}

export function newSpatialCaptureSessionId(): string {
  return randomUUID();
}
