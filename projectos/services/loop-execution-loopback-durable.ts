/**
 * Persist loopback·local_tools AgentRun onto the formal durable disk path
 * (`.projectos/agent-runs/*.run.json` + `*.jsonl`) so getAgentRun / restore /
 * DutyCard associated-run jump share the same lifecycle as production runs.
 *
 * Not a live model. Memory-only Map runs must not masquerade as durable.
 */
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import type { AgentRun } from "../contracts/agent-run.js";
import {
  AgentLifecycleEventSchema,
  AgentRunEventSchema,
  type AgentRunEvent,
} from "../contracts/events.js";
import {
  agentRunLogPath,
  writeRunSnapshot,
} from "./harness/persisted-run.js";
import { upsertAgentRunIndexEntry } from "./agent-pool-index.js";

export type PersistLoopbackDurableRunInput = {
  projectOSRoot: string;
  projectId: string;
  runId: string;
  featureNodeId: string;
  filePath: string;
  unifiedDiff?: string;
  startedAt?: string;
  completedAt?: string;
  status?: "complete" | "error";
  loopInstanceId?: string;
};

function appendEvents(projectOSRoot: string, runId: string, events: AgentRunEvent[]): void {
  const dir = join(projectOSRoot, "agent-runs");
  mkdirSync(dir, { recursive: true });
  const path = agentRunLogPath(projectOSRoot, runId);
  const body = events.map((event) => JSON.stringify(event)).join("\n") + "\n";
  appendFileSync(path, body, "utf8");
}

/**
 * Write a durable AgentRun identity + timeline events for a local_tools apply.
 * Events are real schema events (not invented chat text) so restoreRunFlow can
 * rebuild a non-empty Agent Flow timeline.
 */
export function persistLoopbackDurableAgentRun(
  input: PersistLoopbackDurableRunInput,
): { run: AgentRun; events: AgentRunEvent[] } {
  const startedAt = input.startedAt ?? new Date().toISOString();
  const completedAt = input.completedAt ?? new Date().toISOString();
  const status = input.status ?? "complete";
  const stepId = `step_apply_${input.runId}`;

  const run: AgentRun = {
    runId: input.runId,
    projectId: input.projectId,
    kind: "feature_change",
    status,
    relatedNodeIds: [input.featureNodeId],
    relatedFiles: [input.filePath],
    scope: {
      kind: "leaf-file",
      nodeId: input.featureNodeId,
      filePath: input.filePath,
    },
    role: "leaf_file_editor",
    rootRunId: input.runId,
    startedAt,
    completedAt,
  };

  const events: AgentRunEvent[] = [
    AgentLifecycleEventSchema.parse({
      eventId: `evt_start_${input.runId}`,
      runId: input.runId,
      timestamp: startedAt,
      type: "run_started",
      runSequence: 1,
    }),
    AgentLifecycleEventSchema.parse({
      eventId: `evt_step_start_${input.runId}`,
      runId: input.runId,
      timestamp: startedAt,
      type: "step_started",
      runSequence: 2,
      step: {
        id: stepId,
        label: `Apply ${input.filePath}`,
        kind: "apply",
        status: "running",
        relatedNodeIds: [input.featureNodeId],
        relatedFiles: [input.filePath],
        inputSummary: input.filePath,
      },
    }),
    AgentRunEventSchema.parse({
      eventId: `evt_apply_${input.runId}`,
      runId: input.runId,
      timestamp: completedAt,
      type: "apply_result",
      runSequence: 3,
      phaseId: stepId,
      payload: {
        filesWritten: [input.filePath],
        backupId: `backup_loopback_${input.runId}`,
        outcome: status === "complete" ? "applied" : "rejected",
      },
    }),
    AgentLifecycleEventSchema.parse({
      eventId: `evt_step_done_${input.runId}`,
      runId: input.runId,
      timestamp: completedAt,
      type: status === "complete" ? "step_completed" : "step_failed",
      runSequence: 4,
      step: {
        id: stepId,
        label: `Apply ${input.filePath}`,
        kind: "apply",
        status: status === "complete" ? "complete" : "error",
        relatedNodeIds: [input.featureNodeId],
        relatedFiles: [input.filePath],
        outputSummary:
          status === "complete"
            ? `Wrote ${input.filePath}`
            : `Failed ${input.filePath}`,
      },
    }),
    AgentLifecycleEventSchema.parse({
      eventId: `evt_done_${input.runId}`,
      runId: input.runId,
      timestamp: completedAt,
      type: status === "complete" ? "run_completed" : "step_failed",
      runSequence: 5,
      ...(status === "complete"
        ? {}
        : {
            step: {
              id: stepId,
              label: `Apply ${input.filePath}`,
              kind: "apply",
              status: "error" as const,
              relatedNodeIds: [input.featureNodeId],
              relatedFiles: [input.filePath],
            },
          }),
    }),
  ];

  writeRunSnapshot(input.projectOSRoot, run);
  appendEvents(input.projectOSRoot, input.runId, events);
  upsertAgentRunIndexEntry(input.projectOSRoot, {
    runId: input.runId,
    definitionId: `def_loop_${input.featureNodeId}`,
    poolRunId: `pool_loopback_${input.runId}`,
    rootRunId: input.runId,
    parentRunId: null,
    sessionId: null,
    ...(input.loopInstanceId ? { loopInstanceId: input.loopInstanceId } : {}),
    status,
    attempt: 1,
    startedAt,
    endedAt: completedAt,
    acceptance: "none",
    title: input.filePath || input.featureNodeId,
  });

  return { run, events };
}

/**
 * Append a verification_result action onto an already-durable loopback run.
 * Keeps evidence on the same formal jsonl path (not memory-only).
 */
export function appendLoopbackDurableVerification(input: {
  projectOSRoot: string;
  runId: string;
  command: string;
  status: "passed" | "failed" | "not_run";
  exitCode: number | null;
  stdout?: string;
  stderr?: string;
  evidenceId: string;
}): AgentRunEvent {
  const timestamp = new Date().toISOString();
  const event = AgentRunEventSchema.parse({
    eventId: `evt_verify_${input.runId}_${Date.now()}`,
    runId: input.runId,
    timestamp,
    type: "verification_result",
    runSequence: 6,
    phaseId: `step_apply_${input.runId}`,
    payload: {
      command: input.command,
      status: input.status,
      reason: input.status === "passed" ? "commands_passed" : "command_failed",
      evidenceId: input.evidenceId,
      exitCode: input.exitCode,
      ...(input.stdout ? { stdout: input.stdout.slice(0, 4000) } : {}),
      ...(input.stderr ? { stderr: input.stderr.slice(0, 4000) } : {}),
    },
  });
  appendEvents(input.projectOSRoot, input.runId, [event]);
  return event;
}
