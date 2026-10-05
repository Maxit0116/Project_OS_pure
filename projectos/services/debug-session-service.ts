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
  return records.find((candidate) => candidate.businessNodeId === session.scope.nodeId);
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

export function createInitialDebugSession(
  request: StartDebugSessionRequest,
  harnessRecord: HarnessRecord | null,
  debugLogPort?: number,
): DebugSession {
  const now = new Date().toISOString();
  return {
    version: "0.1.0",
    sessionId: `debug_${globalThis.crypto.randomUUID()}`,
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
    phase: harnessRecord ? "instrument" : "hypothesize",
    verification: harnessRecord?.verification ?? { status: "not_run" },
    ...(debugLogPort ? { debugLogPort } : {}),
    createdAt: now,
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
