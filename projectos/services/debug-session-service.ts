import type { BugAlignmentItem } from "../contracts/alignment-contract.js";
import type { HarnessHypothesis } from "../contracts/harness.js";
import type { HarnessRecord } from "../contracts/harness.js";
import type {
  DebugInstrumentation,
  DebugSession,
  StartDebugSessionRequest,
} from "../contracts/debug-session.js";
import type { AgentConversationScope } from "../contracts/agent-conversation.js";
import type { LoadedProjectOSWorkspace } from "../persistence/workspace-store.js";
import {
  DebugInstrumentationService,
  type InstrumentationSpec,
} from "./debug-instrumentation-service.js";

export interface DebugSessionStoreState {
  session: DebugSession;
  backupByFile: Map<string, string>;
}

export function seedManualHypotheses(bugDescription: string): HarnessHypothesis[] {
  const summary = bugDescription.trim().slice(0, 160) || "the reported runtime failure";
  return [
    {
      id: "hyp_manual_1",
      summary: `Inspect code paths related to: ${summary}`,
      confidence: 0.6,
      evidence: ["User-reported bug description"],
    },
    {
      id: "hyp_manual_2",
      summary: "State, configuration, or integration mismatch in the affected module",
      confidence: 0.4,
      evidence: [],
    },
  ];
}

export function prepareManualDebugSession(
  session: DebugSession,
  scopeFiles: string[],
): DebugSession {
  const hypotheses =
    session.hypotheses.length > 0
      ? session.hypotheses
      : seedManualHypotheses(session.bugDescription);
  return {
    ...session,
    hypotheses,
    phase: scopeFiles.length > 0 ? "instrument" : "reproduce",
    updatedAt: new Date().toISOString(),
  };
}

export function findHarnessRecordForSession(
  harnessRecords: Iterable<HarnessRecord>,
  session: DebugSession,
): HarnessRecord | undefined {
  const records = [...harnessRecords];
  const byError = records.find((candidate) =>
    harnessDescriptionsMatch(candidate.rawError, session.bugDescription),
  );
  if (byError) return byError;
  if (session.scope.kind === "global") return undefined;
  const nodeId = session.scope.nodeId;
  return records.find((candidate) => candidate.businessNodeId === nodeId);
}

export function resolveDebugFixFilePath(
  session: DebugSession,
  workspace: Pick<LoadedProjectOSWorkspace, "graph">,
): string | undefined {
  const touched = session.proposedFix?.touchedFiles?.find((file) => file.trim());
  if (touched) return touched;
  const instrumented = session.instrumentation.find((item) => item.filePath)?.filePath;
  if (instrumented) return instrumented;
  if (session.scope.kind === "file") return session.scope.selectedFilePath;
  const nodeId = session.scope.kind !== "global" ? session.scope.nodeId : undefined;
  if (!nodeId) return undefined;
  const node = workspace.graph.nodes.find((candidate) => candidate.id === nodeId);
  const linked = node?.linkedFiles?.find((file) => file.path)?.path;
  if (linked) return linked;
  return workspace.graph.fileIndex.find((file) => file.nodeIds.includes(nodeId))?.path;
}

function harnessDescriptionsMatch(left: string, right: string): boolean {
  const normalizedLeft = left.toLowerCase().replace(/\s+/gu, " ").trim();
  const normalizedRight = right.toLowerCase().replace(/\s+/gu, " ").trim();
  return normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft);
}

export function splitBugDescriptions(bugDescription: string): string[] {
  const text = bugDescription.replace(/\r\n/g, "\n").trim();
  if (!text) return [];

  const numbered = text
    .split(/\n+/)
    .map((line) => line.replace(/^\s*(?:[-*]|\d+[.)])\s+/u, "").trim())
    .filter((line) => line.length > 0);
  if (numbered.length >= 2) {
    return numbered.slice(0, 12).map((line) => line.slice(0, 500));
  }

  const bySentence = text
    .split(/(?<=[.!?。！？])\s+|\n{2,}|;\s+|\band\b\s+(?=\w)/iu)
    .map((part) => part.trim())
    .filter((part) => part.length > 8);
  if (bySentence.length >= 2 && bySentence.length <= 8) {
    return bySentence.slice(0, 12).map((part) => part.slice(0, 500));
  }

  return [text.slice(0, 500)];
}

export function buildBugAlignmentItems(
  sessionId: string,
  bugDescription: string,
): BugAlignmentItem[] {
  return splitBugDescriptions(bugDescription).map((summary, index) => ({
    id: `${sessionId}_bug_${index + 1}`,
    summary,
    selected: true,
    status: "proposed" as const,
  }));
}

export function needsBugAlignment(bugs: BugAlignmentItem[] | undefined): boolean {
  return (bugs?.length ?? 0) > 1;
}

export function createInitialDebugSession(
  request: StartDebugSessionRequest,
  harnessRecord: HarnessRecord | null,
  debugLogPort?: number,
): DebugSession {
  const now = new Date().toISOString();
  const sessionId = `debug_${globalThis.crypto.randomUUID()}`;
  const bugs = buildBugAlignmentItems(sessionId, request.bugDescription);
  const alignFirst = !harnessRecord && needsBugAlignment(bugs);
  return {
    version: "0.1.0",
    sessionId,
    projectId: request.projectId,
    scope: request.scope,
    bugDescription: request.bugDescription,
    reproSteps: harnessRecord
      ? [
          "Open the affected feature in the running app.",
          "Repeat the action that produced the reported error.",
          "Confirm the same error appears in the terminal or UI.",
        ]
      : [
          "Reproduce the bug using the steps described in chat.",
          "Keep the app running while instrumentation collects logs.",
        ],
    hypotheses: harnessRecord?.hypotheses ?? [],
    ...(harnessRecord?.chosenRootCauseId
      ? { chosenRootCauseId: harnessRecord.chosenRootCauseId }
      : {}),
    ...(harnessRecord?.proposedFix ? { proposedFix: harnessRecord.proposedFix } : {}),
    instrumentation: [],
    logEntries: [],
    phase: alignFirst ? "align" : harnessRecord ? "instrument" : "hypothesize",
    verification: harnessRecord?.verification ?? { status: "not_run" },
    bugs,
    bugsAligned: !alignFirst,
    ...(debugLogPort ? { debugLogPort } : {}),
    ...(request.chatSessionId ? { chatSessionId: request.chatSessionId } : {}),
    createdAt: now,
    updatedAt: now,
  };
}

export function applyBugAlignmentPatches(
  session: DebugSession,
  patches: Array<{
    id: string;
    selected: boolean;
    comment?: string;
    rejected?: boolean;
  }>,
): DebugSession {
  const bugs = session.bugs ?? buildBugAlignmentItems(session.sessionId, session.bugDescription);
  const patchById = new Map(patches.map((patch) => [patch.id, patch]));
  const nextBugs = bugs.map((bug) => {
    const patch = patchById.get(bug.id);
    if (!patch) return bug;
    if (patch.rejected || !patch.selected) {
      return {
        ...bug,
        selected: false,
        status: "rejected" as const,
        ...(patch.comment?.trim() ? { comment: patch.comment.trim() } : {}),
      };
    }
    return {
      ...bug,
      selected: true,
      status: "confirmed" as const,
      ...(patch.comment?.trim() ? { comment: patch.comment.trim() } : {}),
    };
  });
  const confirmed = nextBugs.filter((bug) => bug.status === "confirmed");
  if (confirmed.length < 1) {
    throw new Error("Confirm at least one bug to debug.");
  }
  const focusedDescription = confirmed.map((bug) => {
    const note = bug.comment?.trim();
    return note ? `${bug.summary} (note: ${note})` : bug.summary;
  }).join("\n");
  return {
    ...session,
    bugs: nextBugs,
    bugsAligned: true,
    bugDescription: focusedDescription || session.bugDescription,
    phase: session.phase === "align" ? "hypothesize" : session.phase,
    updatedAt: new Date().toISOString(),
  };
}

export function markBugItemFixed(
  session: DebugSession,
  bugId: string,
): DebugSession {
  const bugs = session.bugs ?? [];
  if (bugs.length === 0) {
    return {
      ...session,
      phase: "complete",
      updatedAt: new Date().toISOString(),
    };
  }
  const now = new Date().toISOString();
  const nextBugs = bugs.map((bug) =>
    bug.id === bugId
      ? { ...bug, status: "fixed" as const, fixedAt: now }
      : bug,
  );
  const open = nextBugs.filter(
    (bug) =>
      bug.selected &&
      bug.status !== "rejected" &&
      bug.status !== "abandoned" &&
      bug.status !== "fixed",
  );
  return {
    ...session,
    bugs: nextBugs,
    phase: open.length === 0 ? "complete" : session.phase === "verify" ? "verify" : session.phase,
    updatedAt: now,
  };
}

export function buildInstrumentationSpecs(
  session: DebugSession,
  scopeFiles: string[],
): InstrumentationSpec[] {
  const hypotheses = session.hypotheses.length
    ? session.hypotheses
    : [
        {
          id: "hyp_default",
          summary: "Inspect runtime state around the reported failure.",
          confidence: 0.5,
          evidence: [],
        },
      ];
  const targetFile = scopeFiles[0] ?? "lib/auth.ts";
  return hypotheses.slice(0, 3).map((hypothesis, index) => ({
    id: `inst_${index + 1}`,
    filePath: targetFile,
    hypothesisId: hypothesis.id,
    anchor: index === 0 ? "export " : "function ",
    kind: index % 2 === 0 ? "fetch_log" : "console_log",
  }));
}

export function chooseRootCause(session: DebugSession): DebugSession {
  const active = session.hypotheses.find((item) => !item.rejected) ?? session.hypotheses[0];
  const chosenRootCauseId = active?.id;
  return {
    ...session,
    chosenRootCauseId,
    proposedFix: session.proposedFix ?? (active
      ? {
          summary: active.summary,
          touchedFiles: session.instrumentation.map((item) => item.filePath),
          patchKind: "root_cause",
        }
      : undefined),
    phase: "fix",
    updatedAt: new Date().toISOString(),
  };
}

export function mergeInstrumentation(
  existing: DebugInstrumentation[],
  applied: DebugInstrumentation[],
): DebugInstrumentation[] {
  const byId = new Map(existing.map((item) => [item.id, item]));
  for (const item of applied) {
    byId.set(item.id, item);
  }
  return [...byId.values()];
}

export function resolveDebugScopeFiles(
  scope: AgentConversationScope,
  harnessRecord: HarnessRecord | null,
  selectedFilePath?: string,
): string[] {
  if (harnessRecord?.technicalFiles.length) {
    return harnessRecord.technicalFiles;
  }
  if (scope.kind === "file") {
    return [scope.selectedFilePath];
  }
  if (selectedFilePath) {
    return [selectedFilePath];
  }
  return [];
}

export const debugInstrumentationService = new DebugInstrumentationService();
