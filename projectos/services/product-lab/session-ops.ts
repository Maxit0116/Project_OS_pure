import {
  LAB_EVIDENCE_BODY_MAX,
  LAB_FINDING_DETAIL_MAX,
  LAB_FINDING_TITLE_MAX,
  type LabCaptureConfig,
  type LabEvidence,
  type LabFinding,
  type LabFindingKind,
  type LabFindingStatus,
  type LabLocation,
  type LabSession,
  type LabSessionStatus,
  type LabStateDocument,
  emptyLabStateDocument,
  newLabId,
  truncateLabText,
} from "../../contracts/product-lab.js";

export interface StartLabSessionInput {
  projectId: string;
  scopeNodeIds?: string[];
  previewUrl?: string | null;
  capture?: Partial<LabCaptureConfig>;
}

export function startLabSession(
  document: LabStateDocument,
  input: StartLabSessionInput,
  nowIso = new Date().toISOString(),
): { document: LabStateDocument; session: LabSession } {
  const ended = endActiveSession(document, nowIso);
  const session: LabSession = {
    id: newLabId("lab"),
    projectId: input.projectId,
    status: "starting",
    cardPhase: "bootstrapping",
    scopeNodeIds: input.scopeNodeIds ?? [],
    previewUrl: input.previewUrl ?? null,
    browserTabId: null,
    capture: {
      consoleErrors: input.capture?.consoleErrors ?? true,
      unhandledRejections: input.capture?.unhandledRejections ?? true,
      failedNetwork: input.capture?.failedNetwork ?? true,
      manualNotes: input.capture?.manualNotes ?? true,
    },
    journeyId: null,
    findingIds: [],
    debugListFindingIds: null,
    capabilityNeeds: [],
    capabilityProposals: [],
    chatSessionId: null,
    activeFixRunId: null,
    startError: null,
    createdAt: nowIso,
    updatedAt: nowIso,
    endedAt: null,
  };
  return {
    document: {
      ...ended,
      activeSessionId: session.id,
      sessions: [session, ...ended.sessions].slice(0, 50),
      updatedAt: nowIso,
    },
    session,
  };
}

export function patchLabSession(
  document: LabStateDocument,
  sessionId: string,
  patch: Partial<
    Pick<
      LabSession,
      | "status"
      | "cardPhase"
      | "previewUrl"
      | "browserTabId"
      | "scopeNodeIds"
      | "activeFixRunId"
      | "startError"
      | "journeyId"
      | "debugListFindingIds"
      | "capabilityNeeds"
      | "capabilityProposals"
      | "chatSessionId"
    >
  >,
  nowIso = new Date().toISOString(),
): LabStateDocument {
  return {
    ...document,
    sessions: document.sessions.map((session) =>
      session.id === sessionId
        ? { ...session, ...patch, updatedAt: nowIso }
        : session,
    ),
    updatedAt: nowIso,
  };
}

export function endLabSession(
  document: LabStateDocument,
  sessionId: string,
  nowIso = new Date().toISOString(),
): LabStateDocument {
  const next = {
    ...document,
    sessions: document.sessions.map((session) =>
      session.id === sessionId
        ? {
            ...session,
            status: "ended" as LabSessionStatus,
            endedAt: nowIso,
            updatedAt: nowIso,
          }
        : session,
    ),
    updatedAt: nowIso,
  };
  if (next.activeSessionId === sessionId) {
    next.activeSessionId = null;
  }
  return next;
}

function endActiveSession(
  document: LabStateDocument,
  nowIso: string,
): LabStateDocument {
  if (!document.activeSessionId) return document;
  return endLabSession(document, document.activeSessionId, nowIso);
}

export interface AddLabFindingInput {
  sessionId: string;
  kind: LabFindingKind;
  title: string;
  detail?: string;
  nodeIds?: string[];
  evidence?: Omit<LabEvidence, "id" | "capturedAt">[];
  location?: LabLocation;
  status?: LabFindingStatus;
}

export function addLabFinding(
  document: LabStateDocument,
  input: AddLabFindingInput,
  nowIso = new Date().toISOString(),
): { document: LabStateDocument; finding: LabFinding } {
  const finding: LabFinding = {
    id: newLabId("find"),
    sessionId: input.sessionId,
    kind: input.kind,
    status: input.status ?? "open",
    title: truncateLabText(input.title.trim() || "Untitled issue", LAB_FINDING_TITLE_MAX),
    detail: truncateLabText(input.detail ?? "", LAB_FINDING_DETAIL_MAX),
    nodeIds: input.nodeIds ?? [],
    evidence: (input.evidence ?? []).slice(0, 8).map((item) => ({
      id: newLabId("ev"),
      kind: item.kind,
      label: truncateLabText(item.label, 240),
      body: truncateLabText(item.body, LAB_EVIDENCE_BODY_MAX),
      capturedAt: nowIso,
    })),
    location: input.location,
    agentRunId: null,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  const sessions = document.sessions.map((session) => {
    if (session.id !== input.sessionId) return session;
    const openCount =
      document.findings.filter(
        (f) =>
          f.sessionId === session.id &&
          f.status === "open" &&
          f.id !== finding.id,
      ).length + (finding.status === "open" ? 1 : 0);
    return {
      ...session,
      findingIds: [finding.id, ...session.findingIds],
      status:
        session.status === "ended" || session.status === "fixing"
          ? session.status
          : openCount > 0
            ? ("triaging" as const)
            : session.status === "starting"
              ? ("experiencing" as const)
              : session.status,
      updatedAt: nowIso,
    };
  });

  return {
    document: {
      ...document,
      sessions,
      findings: [finding, ...document.findings].slice(0, 2_000),
      updatedAt: nowIso,
    },
    finding,
  };
}

export function patchLabFinding(
  document: LabStateDocument,
  findingId: string,
  patch: Partial<
    Pick<LabFinding, "status" | "title" | "detail" | "nodeIds" | "agentRunId">
  >,
  nowIso = new Date().toISOString(),
): LabStateDocument {
  return {
    ...document,
    findings: document.findings.map((finding) =>
      finding.id === findingId
        ? { ...finding, ...patch, updatedAt: nowIso }
        : finding,
    ),
    updatedAt: nowIso,
  };
}

export function getActiveLabSession(
  document: LabStateDocument,
): LabSession | null {
  if (!document.activeSessionId) return null;
  return (
    document.sessions.find((s) => s.id === document.activeSessionId) ?? null
  );
}

export function openFindingsForSession(
  document: LabStateDocument,
  sessionId: string,
): LabFinding[] {
  return document.findings.filter(
    (f) => f.sessionId === sessionId && f.status === "open",
  );
}

export function labNodeFindingCounts(
  document: LabStateDocument,
  sessionId: string | null,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const finding of document.findings) {
    if (sessionId && finding.sessionId !== sessionId) continue;
    if (finding.status !== "open" && finding.status !== "verified_still_broken") {
      continue;
    }
    for (const nodeId of finding.nodeIds) {
      counts[nodeId] = (counts[nodeId] ?? 0) + 1;
    }
  }
  return counts;
}

export function createEmptyLabDocument(
  nowIso = new Date().toISOString(),
): LabStateDocument {
  return emptyLabStateDocument(nowIso);
}
