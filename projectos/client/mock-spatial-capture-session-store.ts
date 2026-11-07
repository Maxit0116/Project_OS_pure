import {
  headFromSpatialCaptureSession,
  nextCaptureVersionTitle,
  SpatialCaptureFolderSchema,
  SpatialCapturePlacementSchema,
  SpatialCaptureSessionSchema,
  type DeleteSpatialCaptureFolderOptions,
  type MergeSpatialCaptureFoldersOptions,
  type SpatialCaptureFolder,
  type SpatialCapturePlacement,
  type SpatialCaptureSession,
  type SpatialCaptureSessionHead,
} from "../contracts/spatial-capture-session.js";
import { cloneJson } from "../utils/json.js";
import { mockGetSpatialPin } from "./mock-spatial-pin-store.js";

interface ProjectSessions {
  sessions: Map<string, SpatialCaptureSession>;
  folders: Map<string, SpatialCaptureFolder>;
}

const sessionsByProject = new Map<string, ProjectSessions>();

function getStore(projectId: string): ProjectSessions {
  let store = sessionsByProject.get(projectId);
  if (!store) {
    store = { sessions: new Map(), folders: new Map() };
    sessionsByProject.set(projectId, store);
  }
  return store;
}

function newId(): string {
  return `capfold_${Math.random().toString(36).slice(2, 10)}`;
}

export function mockClearSpatialCaptureSessions(): void {
  sessionsByProject.clear();
}

export function mockListSpatialCaptureSessions(
  projectId: string,
): SpatialCaptureSessionHead[] {
  return [...getStore(projectId).sessions.values()]
    .map(headFromSpatialCaptureSession)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function mockListSpatialCaptureFolders(
  projectId: string,
): SpatialCaptureFolder[] {
  return [...getStore(projectId).folders.values()]
    .map((folder) => cloneJson(folder))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function mockGetSpatialCaptureSession(
  projectId: string,
  sessionId: string,
): SpatialCaptureSession | null {
  const session = getStore(projectId).sessions.get(sessionId);
  return session ? cloneJson(session) : null;
}

function omitFolderId(session: SpatialCaptureSession): SpatialCaptureSession {
  const { folderId: _drop, ...rest } = session;
  void _drop;
  return rest;
}

function detachFromFolders(
  store: ProjectSessions,
  sessionId: string,
  now: string,
): void {
  for (const folder of [...store.folders.values()]) {
    if (!folder.memberSessionIds.includes(sessionId)) continue;
    const members = folder.memberSessionIds.filter((id) => id !== sessionId);
    if (members.length >= 2) {
      store.folders.set(folder.id, {
        ...folder,
        memberSessionIds: members,
        updatedAt: now,
      });
      continue;
    }
    store.folders.delete(folder.id);
    for (const remainingId of members) {
      const remaining = store.sessions.get(remainingId);
      if (!remaining) continue;
      store.sessions.set(remainingId, {
        ...omitFolderId(remaining),
        updatedAt: now,
      });
    }
  }
}

export function mockUpsertSpatialCaptureSession(
  projectId: string,
  session: SpatialCaptureSession,
): SpatialCaptureSession {
  const store = getStore(projectId);
  const parsed = SpatialCaptureSessionSchema.parse({
    ...session,
    projectId,
  });
  const now = parsed.updatedAt || new Date().toISOString();
  const previous = store.sessions.get(parsed.id);
  if (previous?.folderId && previous.folderId !== parsed.folderId) {
    detachFromFolders(store, parsed.id, now);
  }
  if (!parsed.folderId) {
    detachFromFolders(store, parsed.id, now);
    const cleaned = omitFolderId({ ...parsed, updatedAt: now });
    store.sessions.set(cleaned.id, cloneJson(cleaned));
    return cloneJson(cleaned);
  }
  const folder = store.folders.get(parsed.folderId);
  if (folder && !folder.memberSessionIds.includes(parsed.id)) {
    store.folders.set(folder.id, {
      ...folder,
      memberSessionIds: [...folder.memberSessionIds, parsed.id],
      updatedAt: now,
    });
  }
  const next = { ...parsed, updatedAt: now };
  store.sessions.set(next.id, cloneJson(next));
  return cloneJson(next);
}

export function mockDeleteSpatialCaptureSession(
  projectId: string,
  sessionId: string,
): boolean {
  const store = getStore(projectId);
  const session = store.sessions.get(sessionId);
  if (!session) return false;
  for (const region of session.regions) {
    for (const arrow of region.arrows) {
      if (arrow.status === "submitting") {
        throw new Error(
          `Cannot delete capture session '${sessionId}' while an agent run is in progress`,
        );
      }
      if (arrow.status !== "submitted" || !arrow.runId) continue;
      const pin = mockGetSpatialPin(projectId, arrow.pinId);
      if (
        pin &&
        pin.status !== "done" &&
        pin.status !== "error" &&
        pin.status !== "orphaned" &&
        pin.status !== "draft"
      ) {
        throw new Error(
          `Cannot delete capture session '${sessionId}' while an agent run is in progress`,
        );
      }
    }
  }
  detachFromFolders(store, sessionId, new Date().toISOString());
  return store.sessions.delete(sessionId);
}

function folderTitles(
  store: ProjectSessions,
  folder: SpatialCaptureFolder,
): string[] {
  return folder.memberSessionIds
    .map((id) => store.sessions.get(id)?.title?.trim() || "")
    .filter(Boolean);
}

export function mockPlaceSpatialCaptureSession(
  projectId: string,
  sessionId: string,
  placementInput: SpatialCapturePlacement,
): SpatialCaptureSession {
  const placement = SpatialCapturePlacementSchema.parse(placementInput);
  const store = getStore(projectId);
  const session = store.sessions.get(sessionId);
  if (!session) {
    throw new Error(`Capture session '${sessionId}' not found`);
  }
  const now = new Date().toISOString();
  const title = placement.title.trim();

  if (placement.mode === "misc") {
    return mockUpsertSpatialCaptureSession(projectId, {
      ...omitFolderId(session),
      title: title || session.title,
      updatedAt: now,
    });
  }

  if (placement.mode === "new_folder") {
    const folderName = placement.folderName.trim();
    const folder = SpatialCaptureFolderSchema.parse({
      id: newId(),
      name: folderName,
      memberSessionIds: [sessionId],
      createdAt: now,
      updatedAt: now,
    });
    detachFromFolders(store, sessionId, now);
    store.folders.set(folder.id, folder);
    return mockUpsertSpatialCaptureSession(projectId, {
      ...session,
      title:
        title || nextCaptureVersionTitle(folderName, folderTitles(store, folder)),
      folderId: folder.id,
      updatedAt: now,
    });
  }

  if (placement.mode === "join_folder") {
    const folder = store.folders.get(placement.folderId);
    if (!folder) {
      throw new Error(`Capture folder '${placement.folderId}' not found`);
    }
    return mockUpsertSpatialCaptureSession(projectId, {
      ...session,
      title:
        title ||
        nextCaptureVersionTitle(folder.name, folderTitles(store, folder)),
      folderId: folder.id,
      updatedAt: now,
    });
  }

  const other = store.sessions.get(placement.otherSessionId);
  if (!other) {
    throw new Error(
      `Capture session '${placement.otherSessionId}' not found`,
    );
  }
  const folderName = placement.folderName.trim();
  const folder = SpatialCaptureFolderSchema.parse({
    id: newId(),
    name: folderName,
    memberSessionIds: [placement.otherSessionId, sessionId],
    createdAt: now,
    updatedAt: now,
  });
  detachFromFolders(store, placement.otherSessionId, now);
  detachFromFolders(store, sessionId, now);
  store.folders.set(folder.id, folder);
  const otherTitle =
    placement.otherTitle?.trim() ||
    other.title?.trim() ||
    nextCaptureVersionTitle(folderName, []);
  mockUpsertSpatialCaptureSession(projectId, {
    ...other,
    title: otherTitle,
    folderId: folder.id,
    updatedAt: now,
  });
  return mockUpsertSpatialCaptureSession(projectId, {
    ...session,
    title: title || nextCaptureVersionTitle(folderName, [otherTitle]),
    folderId: folder.id,
    updatedAt: now,
  });
}

export function mockRenameSpatialCaptureFolder(
  projectId: string,
  folderId: string,
  name: string,
): SpatialCaptureFolder {
  const store = getStore(projectId);
  const folder = store.folders.get(folderId);
  if (!folder) throw new Error(`Capture folder '${folderId}' not found`);
  const updated = {
    ...folder,
    name: name.trim().slice(0, 120),
    updatedAt: new Date().toISOString(),
  };
  store.folders.set(folderId, updated);
  return cloneJson(updated);
}

export function mockDeleteSpatialCaptureFolder(
  projectId: string,
  folderId: string,
  options: DeleteSpatialCaptureFolderOptions = { cascade: false },
): boolean {
  const store = getStore(projectId);
  const folder = store.folders.get(folderId);
  if (!folder) return false;
  const memberIds = [...folder.memberSessionIds];
  const now = new Date().toISOString();
  if (options.cascade) {
    store.folders.delete(folderId);
    for (const sessionId of memberIds) {
      mockDeleteSpatialCaptureSession(projectId, sessionId);
    }
    return true;
  }
  store.folders.delete(folderId);
  for (const sessionId of memberIds) {
    const session = store.sessions.get(sessionId);
    if (!session) continue;
    store.sessions.set(sessionId, {
      ...omitFolderId(session),
      updatedAt: now,
    });
  }
  return true;
}

export function mockMergeSpatialCaptureFolders(
  projectId: string,
  sourceFolderId: string,
  targetFolderId: string,
  options: MergeSpatialCaptureFoldersOptions = {},
): SpatialCaptureFolder {
  if (sourceFolderId === targetFolderId) {
    throw new Error("Cannot merge a folder with itself");
  }
  const store = getStore(projectId);
  const source = store.folders.get(sourceFolderId);
  const target = store.folders.get(targetFolderId);
  if (!source) throw new Error(`Capture folder '${sourceFolderId}' not found`);
  if (!target) throw new Error(`Capture folder '${targetFolderId}' not found`);
  const now = new Date().toISOString();
  const mergedMembers = [
    ...new Set([...target.memberSessionIds, ...source.memberSessionIds]),
  ];
  const nextName = (options.name?.trim() || target.name).slice(0, 120);
  store.folders.delete(sourceFolderId);
  const merged = SpatialCaptureFolderSchema.parse({
    ...target,
    name: nextName,
    memberSessionIds: mergedMembers,
    updatedAt: now,
  });
  store.folders.set(targetFolderId, merged);
  for (const sessionId of source.memberSessionIds) {
    const session = store.sessions.get(sessionId);
    if (!session || session.folderId === targetFolderId) continue;
    mockUpsertSpatialCaptureSession(projectId, {
      ...session,
      folderId: targetFolderId,
      updatedAt: now,
    });
  }
  return cloneJson(store.folders.get(targetFolderId)!);
}

export function mockSuggestCaptureVersionTitle(
  projectId: string,
  target: { folderId: string } | { folderName: string },
): string {
  if ("folderName" in target) {
    return nextCaptureVersionTitle(target.folderName, []);
  }
  const folder = getStore(projectId).folders.get(target.folderId);
  if (!folder) throw new Error(`Capture folder '${target.folderId}' not found`);
  return nextCaptureVersionTitle(
    folder.name,
    folderTitles(getStore(projectId), folder),
  );
}
