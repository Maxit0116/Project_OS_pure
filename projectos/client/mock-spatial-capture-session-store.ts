import {
  headFromSpatialCaptureSession,
  SpatialCaptureSessionSchema,
  type SpatialCaptureSession,
  type SpatialCaptureSessionHead,
} from "../contracts/spatial-capture-session.js";
import { cloneJson } from "../utils/json.js";
import { mockGetSpatialPin } from "./mock-spatial-pin-store.js";

interface ProjectSessions {
  sessions: Map<string, SpatialCaptureSession>;
}

const sessionsByProject = new Map<string, ProjectSessions>();

function getStore(projectId: string): ProjectSessions {
  let store = sessionsByProject.get(projectId);
  if (!store) {
    store = { sessions: new Map() };
    sessionsByProject.set(projectId, store);
  }
  return store;
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

export function mockGetSpatialCaptureSession(
  projectId: string,
  sessionId: string,
): SpatialCaptureSession | null {
  const session = getStore(projectId).sessions.get(sessionId);
  return session ? cloneJson(session) : null;
}

export function mockUpsertSpatialCaptureSession(
  projectId: string,
  session: SpatialCaptureSession,
): SpatialCaptureSession {
  const parsed = SpatialCaptureSessionSchema.parse({
    ...session,
    projectId,
  });
  getStore(projectId).sessions.set(parsed.id, cloneJson(parsed));
  return cloneJson(parsed);
}

export function mockDeleteSpatialCaptureSession(
  projectId: string,
  sessionId: string,
): boolean {
  const session = getStore(projectId).sessions.get(sessionId);
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
  return getStore(projectId).sessions.delete(sessionId);
}
