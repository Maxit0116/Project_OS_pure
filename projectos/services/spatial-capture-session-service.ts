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
  DeleteSpatialCaptureFolderOptionsSchema,
  headFromSpatialCaptureSession,
  MergeSpatialCaptureFoldersOptionsSchema,
  nextCaptureVersionTitle,
  SpatialCaptureFolderSchema,
  SpatialCapturePlacementSchema,
  SpatialCaptureSessionIndexSchema,
  SpatialCaptureSessionSchema,
  type DeleteSpatialCaptureFolderOptions,
  type MergeSpatialCaptureFoldersOptions,
  type SpatialCaptureFolder,
  type SpatialCapturePlacement,
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
    return { version: "0.1.0", heads: [], folders: [] };
  }
  try {
    return SpatialCaptureSessionIndexSchema.parse(
      JSON.parse(readFileSync(indexPath, "utf8")),
    );
  } catch {
    return { version: "0.1.0", heads: [], folders: [] };
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

function writeSessionFile(
  workspaceRoot: string,
  session: SpatialCaptureSession,
): void {
  ensureCapturesDir(workspaceRoot);
  writeFileSync(
    join(workspaceRoot, sessionFilePath(session.id)),
    `${JSON.stringify(session, null, 2)}\n`,
    "utf8",
  );
}

function readSessionFile(
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

function omitFolderId(
  session: SpatialCaptureSession,
): SpatialCaptureSession {
  const { folderId: _drop, ...rest } = session;
  void _drop;
  return rest;
}

function patchSessionOnDisk(
  workspaceRoot: string,
  sessionId: string,
  patch: Partial<SpatialCaptureSession> & { clearFolderId?: boolean },
): SpatialCaptureSession | null {
  const existing = readSessionFile(workspaceRoot, sessionId);
  if (!existing) return null;
  const { clearFolderId, ...restPatch } = patch;
  const merged = {
    ...existing,
    ...restPatch,
    updatedAt: restPatch.updatedAt ?? new Date().toISOString(),
  };
  const next = SpatialCaptureSessionSchema.parse(
    clearFolderId ? omitFolderId(merged) : merged,
  );
  writeSessionFile(workspaceRoot, next);
  return next;
}

function folderTitles(
  workspaceRoot: string,
  folder: SpatialCaptureFolder,
): string[] {
  return folder.memberSessionIds
    .map((id) => {
      const session = readSessionFile(workspaceRoot, id);
      return session?.title?.trim() || "";
    })
    .filter(Boolean);
}

function upsertFolder(
  index: SpatialCaptureSessionIndex,
  folder: SpatialCaptureFolder,
): SpatialCaptureSessionIndex {
  const parsed = SpatialCaptureFolderSchema.parse(folder);
  const folders = index.folders.filter((item) => item.id !== parsed.id);
  return {
    ...index,
    folders: [parsed, ...folders].sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    ),
  };
}

/** Remove session from any folder; dissolve folders that drop below 2 members. */
function detachSessionFromFolders(
  workspaceRoot: string,
  index: SpatialCaptureSessionIndex,
  sessionId: string,
  now: string,
): SpatialCaptureSessionIndex {
  let next = index;
  for (const folder of index.folders) {
    if (!folder.memberSessionIds.includes(sessionId)) continue;
    const members = folder.memberSessionIds.filter((id) => id !== sessionId);
    if (members.length >= 2) {
      next = upsertFolder(next, {
        ...folder,
        memberSessionIds: members,
        updatedAt: now,
      });
      continue;
    }
    // Dissolve: remaining member (if any) returns to Misc.
    next = {
      ...next,
      folders: next.folders.filter((item) => item.id !== folder.id),
    };
    for (const remainingId of members) {
      const patched = patchSessionOnDisk(workspaceRoot, remainingId, {
        clearFolderId: true,
        updatedAt: now,
      });
      if (patched) {
        next = upsertHead(next, headFromSpatialCaptureSession(patched));
      }
    }
  }
  return next;
}

function attachSessionToFolder(
  index: SpatialCaptureSessionIndex,
  folder: SpatialCaptureFolder,
  sessionId: string,
  now: string,
): SpatialCaptureSessionIndex {
  const members = folder.memberSessionIds.includes(sessionId)
    ? folder.memberSessionIds
    : [...folder.memberSessionIds, sessionId];
  return upsertFolder(index, {
    ...folder,
    memberSessionIds: members,
    updatedAt: now,
  });
}

export function listSpatialCaptureSessions(
  workspaceRoot: string,
): SpatialCaptureSessionHead[] {
  return [...readIndex(workspaceRoot).heads].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );
}

export function listSpatialCaptureFolders(
  workspaceRoot: string,
): SpatialCaptureFolder[] {
  return [...readIndex(workspaceRoot).folders].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );
}

export function getSpatialCaptureFolder(
  workspaceRoot: string,
  folderId: string,
): SpatialCaptureFolder | null {
  return (
    readIndex(workspaceRoot).folders.find((folder) => folder.id === folderId) ??
    null
  );
}

export function getSpatialCaptureSession(
  workspaceRoot: string,
  sessionId: string,
): SpatialCaptureSession | null {
  return readSessionFile(workspaceRoot, sessionId);
}

export function upsertSpatialCaptureSession(
  workspaceRoot: string,
  session: SpatialCaptureSession,
): SpatialCaptureSession {
  const parsed = SpatialCaptureSessionSchema.parse({
    ...session,
    updatedAt: session.updatedAt || new Date().toISOString(),
  });
  writeSessionFile(workspaceRoot, parsed);

  let index = readIndex(workspaceRoot);
  const now = parsed.updatedAt;
  const previousFolderId = index.heads.find(
    (head) => head.id === parsed.id,
  )?.folderId;

  if (previousFolderId && previousFolderId !== parsed.folderId) {
    index = detachSessionFromFolders(workspaceRoot, index, parsed.id, now);
  }

  if (parsed.folderId) {
    const folder = index.folders.find((item) => item.id === parsed.folderId);
    if (folder) {
      index = attachSessionToFolder(index, folder, parsed.id, now);
    }
  } else {
    index = detachSessionFromFolders(workspaceRoot, index, parsed.id, now);
  }

  writeIndex(
    workspaceRoot,
    upsertHead(index, headFromSpatialCaptureSession(parsed)),
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

function deleteSessionAssets(
  workspaceRoot: string,
  session: SpatialCaptureSession,
): void {
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

  deleteSessionAssets(workspaceRoot, session);

  const filePath = join(workspaceRoot, sessionFilePath(sessionId));
  if (existsSync(filePath)) {
    unlinkSync(filePath);
  }

  const now = new Date().toISOString();
  let index = readIndex(workspaceRoot);
  index = detachSessionFromFolders(workspaceRoot, index, sessionId, now);
  writeIndex(workspaceRoot, {
    ...index,
    heads: index.heads.filter((head) => head.id !== sessionId),
  });
  return true;
}

export function placeSpatialCaptureSession(
  workspaceRoot: string,
  sessionId: string,
  placementInput: SpatialCapturePlacement,
): SpatialCaptureSession {
  const placement = SpatialCapturePlacementSchema.parse(placementInput);
  const session = getSpatialCaptureSession(workspaceRoot, sessionId);
  if (!session) {
    throw new SpatialCaptureSessionError(
      "not_found",
      `Capture session '${sessionId}' not found`,
    );
  }

  const now = new Date().toISOString();
  const title = placement.title.trim();

  if (placement.mode === "misc") {
    return upsertSpatialCaptureSession(workspaceRoot, {
      ...omitFolderId(session),
      title: title || session.title,
      updatedAt: now,
    });
  }

  if (placement.mode === "new_folder") {
    const folderName = placement.folderName.trim();
    if (!folderName) {
      throw new SpatialCaptureSessionError(
        "invalid",
        "Folder name is required",
      );
    }
    const folder: SpatialCaptureFolder = {
      id: randomUUID(),
      name: folderName,
      memberSessionIds: [sessionId],
      createdAt: now,
      updatedAt: now,
    };
    let index = readIndex(workspaceRoot);
    index = detachSessionFromFolders(workspaceRoot, index, sessionId, now);
    index = upsertFolder(index, folder);
    writeIndex(workspaceRoot, index);

    const versionTitle =
      title || nextCaptureVersionTitle(folderName, folderTitles(workspaceRoot, folder));
    return upsertSpatialCaptureSession(workspaceRoot, {
      ...session,
      title: versionTitle,
      folderId: folder.id,
      updatedAt: now,
    });
  }

  if (placement.mode === "join_folder") {
    const folder = getSpatialCaptureFolder(workspaceRoot, placement.folderId);
    if (!folder) {
      throw new SpatialCaptureSessionError(
        "not_found",
        `Capture folder '${placement.folderId}' not found`,
      );
    }
    const versionTitle =
      title ||
      nextCaptureVersionTitle(folder.name, folderTitles(workspaceRoot, folder));
    return upsertSpatialCaptureSession(workspaceRoot, {
      ...session,
      title: versionTitle,
      folderId: folder.id,
      updatedAt: now,
    });
  }

  // merge_misc
  if (placement.otherSessionId === sessionId) {
    throw new SpatialCaptureSessionError(
      "invalid",
      "Cannot merge a capture with itself",
    );
  }
  const other = getSpatialCaptureSession(workspaceRoot, placement.otherSessionId);
  if (!other) {
    throw new SpatialCaptureSessionError(
      "not_found",
      `Capture session '${placement.otherSessionId}' not found`,
    );
  }
  const folderName = placement.folderName.trim();
  if (!folderName) {
    throw new SpatialCaptureSessionError("invalid", "Folder name is required");
  }

  const folder: SpatialCaptureFolder = {
    id: randomUUID(),
    name: folderName,
    memberSessionIds: [placement.otherSessionId, sessionId],
    createdAt: now,
    updatedAt: now,
  };

  let index = readIndex(workspaceRoot);
  index = detachSessionFromFolders(
    workspaceRoot,
    index,
    placement.otherSessionId,
    now,
  );
  index = detachSessionFromFolders(workspaceRoot, index, sessionId, now);
  index = upsertFolder(index, folder);
  writeIndex(workspaceRoot, index);

  const otherTitle =
    placement.otherTitle?.trim() ||
    other.title?.trim() ||
    nextCaptureVersionTitle(folderName, []);
  const selfTitle =
    title || nextCaptureVersionTitle(folderName, [otherTitle]);

  upsertSpatialCaptureSession(workspaceRoot, {
    ...other,
    title: otherTitle,
    folderId: folder.id,
    updatedAt: now,
  });

  return upsertSpatialCaptureSession(workspaceRoot, {
    ...session,
    title: selfTitle,
    folderId: folder.id,
    updatedAt: now,
  });
}

export function renameSpatialCaptureFolder(
  workspaceRoot: string,
  folderId: string,
  name: string,
): SpatialCaptureFolder {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new SpatialCaptureSessionError("invalid", "Folder name is required");
  }
  const index = readIndex(workspaceRoot);
  const existing = index.folders.find((folder) => folder.id === folderId);
  if (!existing) {
    throw new SpatialCaptureSessionError(
      "not_found",
      `Capture folder '${folderId}' not found`,
    );
  }
  const updated: SpatialCaptureFolder = {
    ...existing,
    name: trimmed.slice(0, 120),
    updatedAt: new Date().toISOString(),
  };
  writeIndex(workspaceRoot, upsertFolder(index, updated));
  return updated;
}

export function deleteSpatialCaptureFolder(
  workspaceRoot: string,
  folderId: string,
  optionsInput: DeleteSpatialCaptureFolderOptions = { cascade: false },
): boolean {
  const options = DeleteSpatialCaptureFolderOptionsSchema.parse(optionsInput);
  const index = readIndex(workspaceRoot);
  const folder = index.folders.find((item) => item.id === folderId);
  if (!folder) return false;

  const now = new Date().toISOString();
  const memberIds = [...folder.memberSessionIds];

  if (options.cascade) {
    for (const sessionId of memberIds) {
      const session = getSpatialCaptureSession(workspaceRoot, sessionId);
      if (session && sessionHasRunningPins(workspaceRoot, session)) {
        throw new SpatialCaptureSessionError(
          "running",
          `Cannot delete capture folder '${folderId}' while an agent run is in progress`,
        );
      }
    }
    // Remove folder first so deleteSession doesn't chase membership.
    writeIndex(workspaceRoot, {
      ...index,
      folders: index.folders.filter((item) => item.id !== folderId),
    });
    for (const sessionId of memberIds) {
      deleteSpatialCaptureSession(workspaceRoot, sessionId);
    }
    return true;
  }

  // Dissolve → Misc
  let next: SpatialCaptureSessionIndex = {
    ...index,
    folders: index.folders.filter((item) => item.id !== folderId),
  };
  for (const sessionId of memberIds) {
    const patched = patchSessionOnDisk(workspaceRoot, sessionId, {
      clearFolderId: true,
      updatedAt: now,
    });
    if (patched) {
      next = upsertHead(next, headFromSpatialCaptureSession(patched));
    }
  }
  writeIndex(workspaceRoot, next);
  return true;
}

/**
 * Move every member of `sourceFolderId` into `targetFolderId`, then remove the
 * source folder. Capture titles stay unchanged. Optional `name` renames the
 * surviving (target) folder.
 */
export function mergeSpatialCaptureFolders(
  workspaceRoot: string,
  sourceFolderId: string,
  targetFolderId: string,
  optionsInput: MergeSpatialCaptureFoldersOptions = {},
): SpatialCaptureFolder {
  const options = MergeSpatialCaptureFoldersOptionsSchema.parse(optionsInput);
  if (sourceFolderId === targetFolderId) {
    throw new SpatialCaptureSessionError(
      "invalid",
      "Cannot merge a folder with itself",
    );
  }

  let index = readIndex(workspaceRoot);
  const source = index.folders.find((folder) => folder.id === sourceFolderId);
  const target = index.folders.find((folder) => folder.id === targetFolderId);
  if (!source) {
    throw new SpatialCaptureSessionError(
      "not_found",
      `Capture folder '${sourceFolderId}' not found`,
    );
  }
  if (!target) {
    throw new SpatialCaptureSessionError(
      "not_found",
      `Capture folder '${targetFolderId}' not found`,
    );
  }

  const now = new Date().toISOString();
  const mergedMembers = [
    ...new Set([...target.memberSessionIds, ...source.memberSessionIds]),
  ];
  const nextName = (options.name?.trim() || target.name).slice(0, 120);
  const sourceMemberIds = [...source.memberSessionIds];

  // Drop source first so later upserts do not try to detach from a dissolving folder.
  index = {
    ...index,
    folders: index.folders.filter((folder) => folder.id !== sourceFolderId),
  };
  index = upsertFolder(index, {
    ...target,
    name: nextName,
    memberSessionIds: mergedMembers,
    updatedAt: now,
  });
  writeIndex(workspaceRoot, index);

  for (const sessionId of sourceMemberIds) {
    const session = readSessionFile(workspaceRoot, sessionId);
    if (!session) continue;
    if (session.folderId === targetFolderId) continue;
    upsertSpatialCaptureSession(workspaceRoot, {
      ...session,
      folderId: targetFolderId,
      updatedAt: now,
    });
  }

  const merged = getSpatialCaptureFolder(workspaceRoot, targetFolderId);
  if (!merged) {
    throw new SpatialCaptureSessionError(
      "not_found",
      `Capture folder '${targetFolderId}' not found after merge`,
    );
  }
  return merged;
}

export function suggestCaptureVersionTitle(
  workspaceRoot: string,
  folderIdOrName: { folderId: string } | { folderName: string },
): string {
  if ("folderId" in folderIdOrName) {
    const folder = getSpatialCaptureFolder(
      workspaceRoot,
      folderIdOrName.folderId,
    );
    if (!folder) {
      throw new SpatialCaptureSessionError(
        "not_found",
        `Capture folder '${folderIdOrName.folderId}' not found`,
      );
    }
    return nextCaptureVersionTitle(
      folder.name,
      folderTitles(workspaceRoot, folder),
    );
  }
  return nextCaptureVersionTitle(folderIdOrName.folderName, []);
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

export function newSpatialCaptureFolderId(): string {
  return randomUUID();
}
