import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import {
  AgentDefinitionSchema,
  AgentPoolRunSchema,
  AgentRunIndexEntrySchema,
  type AgentDefinition,
  type AgentPoolRun,
  type AgentPoolTriggerSource,
  type AgentRunAcceptance,
  type AgentRunIndexEntry,
} from "../contracts/agent-pool-trace.js";
import {
  createWorkforceDefinitionId,
  isWorkforceAgent,
  WorkforceAgentDraftSchema,
  type WorkforceAgentDraft,
} from "../contracts/agent-workforce.js";
import type { AgentRun } from "../contracts/agent-run.js";
import type { AgentRunEvent } from "../contracts/events.js";
import { writeDurableTextReplacing, createDurableFilePersistencePrimitives } from "../persistence/durable-file.js";

const durable = createDurableFilePersistencePrimitives();

export function agentRunsIndexPath(projectOSRoot: string): string {
  return join(projectOSRoot, "agent-runs", "index.jsonl");
}

export function agentPoolRunPath(projectOSRoot: string, poolRunId: string): string {
  return join(projectOSRoot, "agent-pool-runs", `${poolRunId}.json`);
}

export function agentDefinitionPath(projectOSRoot: string, definitionId: string): string {
  return join(projectOSRoot, "agent-definitions", `${definitionId}.json`);
}

function ensureDir(path: string): void {
  mkdirSync(path, { recursive: true });
}

function isSafeId(id: string): boolean {
  return (
    id.length > 0 &&
    id.length <= 200 &&
    !id.includes("/") &&
    !id.includes("\\") &&
    !id.includes("..") &&
    !id.includes("\0")
  );
}

export function createPoolRunId(): string {
  return `pool_${crypto.randomUUID()}`;
}

export function upsertAgentDefinition(
  projectOSRoot: string,
  definition: unknown,
): AgentDefinition {
  const parsed = AgentDefinitionSchema.parse(definition);
  if (!isSafeId(parsed.definitionId)) {
    throw new Error("invalid definitionId");
  }
  const dir = join(projectOSRoot, "agent-definitions");
  ensureDir(dir);
  writeDurableTextReplacing(
    agentDefinitionPath(projectOSRoot, parsed.definitionId),
    `${JSON.stringify(parsed, null, 2)}\n`,
    durable,
  );
  return parsed;
}

export function readAgentDefinition(
  projectOSRoot: string,
  definitionId: string,
): AgentDefinition | null {
  if (!isSafeId(definitionId)) return null;
  const path = agentDefinitionPath(projectOSRoot, definitionId);
  if (!existsSync(path)) return null;
  try {
    return AgentDefinitionSchema.parse(JSON.parse(readFileSync(path, "utf8")));
  } catch {
    return null;
  }
}

export function listAgentDefinitions(
  projectOSRoot: string,
  options?: { kind?: "workforce" | "pool_lane" | "all" },
): AgentDefinition[] {
  const dir = join(projectOSRoot, "agent-definitions");
  if (!existsSync(dir)) return [];
  let names: string[] = [];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  const kindFilter = options?.kind ?? "all";
  const out: AgentDefinition[] = [];
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    const id = name.slice(0, -".json".length);
    const def = readAgentDefinition(projectOSRoot, id);
    if (!def) continue;
    if (kindFilter === "workforce" && !isWorkforceAgent(def)) continue;
    if (kindFilter === "pool_lane" && isWorkforceAgent(def)) continue;
    out.push(def);
  }
  out.sort((a, b) => a.config.displayName.localeCompare(b.config.displayName));
  return out;
}

export function listWorkforceAgents(projectOSRoot: string): AgentDefinition[] {
  return listAgentDefinitions(projectOSRoot, { kind: "workforce" });
}

export function createWorkforceAgent(
  projectOSRoot: string,
  input: {
    projectId?: string;
    draft: WorkforceAgentDraft;
  },
): AgentDefinition {
  const draft = WorkforceAgentDraftSchema.parse(input.draft);
  const now = new Date().toISOString();
  return upsertAgentDefinition(projectOSRoot, {
    definitionId: createWorkforceDefinitionId(),
    ...(input.projectId ? { projectId: input.projectId } : {}),
    createdAt: now,
    updatedAt: now,
    config: {
      kind: "workforce",
      displayName: draft.displayName,
      ...(draft.roleLabel ? { role: draft.roleLabel, roleLabel: draft.roleLabel } : {}),
      instructions: draft.instructions,
      modelProfileId: draft.modelProfileId ?? null,
      skillIds: draft.skillIds,
      mcpServerIds: draft.mcpServerIds,
      ...(draft.permissionNotes ? { permissionNotes: draft.permissionNotes } : {}),
    },
  });
}

export function updateWorkforceAgent(
  projectOSRoot: string,
  input: {
    definitionId: string;
    draft: WorkforceAgentDraft;
  },
): AgentDefinition {
  const existing = readAgentDefinition(projectOSRoot, input.definitionId);
  if (!existing || !isWorkforceAgent(existing)) {
    throw new Error("workforce agent not found");
  }
  const draft = WorkforceAgentDraftSchema.parse(input.draft);
  const now = new Date().toISOString();
  return upsertAgentDefinition(projectOSRoot, {
    ...existing,
    updatedAt: now,
    config: {
      ...existing.config,
      kind: "workforce",
      displayName: draft.displayName,
      ...(draft.roleLabel
        ? { role: draft.roleLabel, roleLabel: draft.roleLabel }
        : { role: existing.config.role, roleLabel: existing.config.roleLabel }),
      instructions: draft.instructions,
      modelProfileId: draft.modelProfileId ?? null,
      skillIds: draft.skillIds,
      mcpServerIds: draft.mcpServerIds,
      ...(draft.permissionNotes
        ? { permissionNotes: draft.permissionNotes }
        : existing.config.permissionNotes
          ? { permissionNotes: existing.config.permissionNotes }
          : {}),
    },
  });
}

export function writeAgentPoolRun(
  projectOSRoot: string,
  poolRun: AgentPoolRun,
): AgentPoolRun {
  if (!isSafeId(poolRun.poolRunId)) {
    throw new Error("invalid poolRunId");
  }
  ensureDir(join(projectOSRoot, "agent-pool-runs"));
  const parsed = AgentPoolRunSchema.parse(poolRun);
  writeDurableTextReplacing(
    agentPoolRunPath(projectOSRoot, parsed.poolRunId),
    `${JSON.stringify(parsed, null, 2)}\n`,
    durable,
  );
  return parsed;
}

export function readAgentPoolRun(
  projectOSRoot: string,
  poolRunId: string,
): AgentPoolRun | null {
  if (!isSafeId(poolRunId)) return null;
  const path = agentPoolRunPath(projectOSRoot, poolRunId);
  if (!existsSync(path)) return null;
  try {
    return AgentPoolRunSchema.parse(JSON.parse(readFileSync(path, "utf8")));
  } catch {
    return null;
  }
}

export function ensureAgentPoolRun(input: {
  projectOSRoot: string;
  projectId?: string | undefined;
  rootRunId?: string | null | undefined;
  sessionId?: string | null | undefined;
  loopInstanceId?: string | null | undefined;
  loopSpecId?: string | null | undefined;
  triggerSource?: AgentPoolTriggerSource | undefined;
  existingPoolRunId?: string | null | undefined;
}): AgentPoolRun {
  if (input.existingPoolRunId) {
    const existing = readAgentPoolRun(input.projectOSRoot, input.existingPoolRunId);
    if (existing) return existing;
  }
  // Reuse by rootRunId relationship when possible (scan pool-run files is expensive;
  // callers should pass existingPoolRunId from an in-memory map).
  const now = new Date().toISOString();
  const poolRun: AgentPoolRun = {
    poolRunId: createPoolRunId(),
    ...(input.projectId ? { projectId: input.projectId } : {}),
    status: "running",
    createdAt: now,
    startedAt: now,
    agentRunIds: input.rootRunId ? [input.rootRunId] : [],
    rootRunId: input.rootRunId ?? null,
    sessionId: input.sessionId ?? null,
    loopInstanceId: input.loopInstanceId ?? null,
    loopSpecId: input.loopSpecId ?? null,
    triggerSource: input.triggerSource ?? "unknown",
  };
  return writeAgentPoolRun(input.projectOSRoot, poolRun);
}

export function attachAgentRunToPoolRun(
  projectOSRoot: string,
  poolRunId: string,
  runId: string,
): AgentPoolRun | null {
  const pool = readAgentPoolRun(projectOSRoot, poolRunId);
  if (!pool) return null;
  if (pool.agentRunIds.includes(runId)) return pool;
  return writeAgentPoolRun(projectOSRoot, {
    ...pool,
    agentRunIds: [...pool.agentRunIds, runId],
  });
}

function readIndexLines(projectOSRoot: string): AgentRunIndexEntry[] {
  const path = agentRunsIndexPath(projectOSRoot);
  if (!existsSync(path)) return [];
  let raw = "";
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return [];
  }
  const entries: AgentRunIndexEntry[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = AgentRunIndexEntrySchema.safeParse(JSON.parse(trimmed));
      if (parsed.success) entries.push(parsed.data);
    } catch {
      // skip corrupt
    }
  }
  return entries;
}

/** Latest entry per runId (later lines win). */
export function loadAgentRunIndex(projectOSRoot: string): Map<string, AgentRunIndexEntry> {
  const map = new Map<string, AgentRunIndexEntry>();
  for (const entry of readIndexLines(projectOSRoot)) {
    map.set(entry.runId, entry);
  }
  return map;
}

export function appendAgentRunIndexEntry(
  projectOSRoot: string,
  entry: AgentRunIndexEntry,
): void {
  const parsed = AgentRunIndexEntrySchema.parse(entry);
  const dir = join(projectOSRoot, "agent-runs");
  ensureDir(dir);
  appendFileSync(
    agentRunsIndexPath(projectOSRoot),
    `${JSON.stringify(parsed)}\n`,
    "utf8",
  );
}

export function upsertAgentRunIndexEntry(
  projectOSRoot: string,
  patch: Partial<AgentRunIndexEntry> & Pick<AgentRunIndexEntry, "runId">,
): AgentRunIndexEntry {
  const existing = loadAgentRunIndex(projectOSRoot).get(patch.runId);
  const merged: AgentRunIndexEntry = AgentRunIndexEntrySchema.parse({
    runId: patch.runId,
    definitionId: patch.definitionId ?? existing?.definitionId ?? `def_unknown_${patch.runId}`,
    poolRunId: patch.poolRunId ?? existing?.poolRunId ?? "pool_unknown",
    rootRunId: patch.rootRunId !== undefined ? patch.rootRunId : existing?.rootRunId ?? null,
    parentRunId:
      patch.parentRunId !== undefined ? patch.parentRunId : existing?.parentRunId ?? null,
    sessionId: patch.sessionId !== undefined ? patch.sessionId : existing?.sessionId ?? null,
    loopInstanceId:
      patch.loopInstanceId !== undefined
        ? patch.loopInstanceId
        : existing?.loopInstanceId ?? null,
    status: patch.status ?? existing?.status ?? "unknown",
    attempt: patch.attempt ?? existing?.attempt ?? 1,
    startedAt: patch.startedAt ?? existing?.startedAt ?? new Date().toISOString(),
    ...(patch.endedAt !== undefined
      ? { endedAt: patch.endedAt }
      : existing?.endedAt
        ? { endedAt: existing.endedAt }
        : {}),
    acceptance: patch.acceptance ?? existing?.acceptance ?? "none",
    title: patch.title ?? existing?.title ?? patch.runId,
  });
  appendAgentRunIndexEntry(projectOSRoot, merged);
  return merged;
}

export function listAgentRunsByDefinition(
  projectOSRoot: string,
  definitionId: string,
  options: { limit?: number | undefined; offset?: number | undefined } = {},
): AgentRunIndexEntry[] {
  const all = [...loadAgentRunIndex(projectOSRoot).values()]
    .filter((entry) => entry.definitionId === definitionId)
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
  const offset = options.offset ?? 0;
  const limit = options.limit ?? 50;
  return all.slice(offset, offset + limit);
}

export function setAgentRunAcceptance(
  projectOSRoot: string,
  runId: string,
  acceptance: AgentRunAcceptance,
): AgentRunIndexEntry | null {
  const existing = loadAgentRunIndex(projectOSRoot).get(runId);
  if (!existing) {
    return upsertAgentRunIndexEntry(projectOSRoot, {
      runId,
      acceptance,
      definitionId: `def_unknown_${runId}`,
      poolRunId: "pool_unknown",
      status: "complete",
      startedAt: new Date().toISOString(),
      title: runId,
    });
  }
  return upsertAgentRunIndexEntry(projectOSRoot, {
    runId,
    acceptance,
  });
}

export function watermarkFromEvents(events: AgentRunEvent[]): {
  watermark: number | null;
  watermarkEventId: string | null;
} {
  if (events.length === 0) {
    return { watermark: null, watermarkEventId: null };
  }
  let maxSeq: number | null = null;
  let maxEventId: string | null = null;
  for (const event of events) {
    if (typeof event.runSequence === "number") {
      if (maxSeq == null || event.runSequence >= maxSeq) {
        maxSeq = event.runSequence;
        maxEventId = event.eventId;
      }
    } else {
      maxEventId = event.eventId;
    }
  }
  return { watermark: maxSeq, watermarkEventId: maxEventId };
}

export function indexEntryFromAgentRun(input: {
  run: AgentRun;
  definitionId: string;
  poolRunId: string;
  sessionId?: string | null;
  loopInstanceId?: string | null;
  title?: string;
  attempt?: number;
  acceptance?: AgentRunAcceptance;
}): AgentRunIndexEntry {
  return AgentRunIndexEntrySchema.parse({
    runId: input.run.runId,
    definitionId: input.definitionId,
    poolRunId: input.poolRunId,
    rootRunId: input.run.rootRunId ?? input.run.runId,
    parentRunId: input.run.parentRunId ?? null,
    sessionId: input.sessionId ?? null,
    loopInstanceId: input.loopInstanceId ?? null,
    status: input.run.status,
    attempt: input.attempt ?? 1,
    startedAt: input.run.startedAt,
    ...(input.run.completedAt ? { endedAt: input.run.completedAt } : {}),
    acceptance: input.acceptance ?? "none",
    title: input.title ?? input.run.runId,
  });
}

/**
 * Best-effort index update from an emitted event. Never throws to caller —
 * swallows IO errors so Orchestrator emit stays healthy.
 */
export function safeUpdateIndexFromEvent(
  projectOSRoot: string,
  event: AgentRunEvent,
  run: AgentRun,
  context: {
    definitionId: string;
    poolRunId: string;
    sessionId?: string | null;
    title?: string;
  },
): void {
  try {
    const terminal =
      event.type === "run_completed" ||
      event.type === "run_cancelled" ||
      event.type === "run_interrupted" ||
      event.type === "step_failed";
    upsertAgentRunIndexEntry(projectOSRoot, {
      runId: run.runId,
      definitionId: context.definitionId,
      poolRunId: context.poolRunId,
      rootRunId: run.rootRunId ?? run.runId,
      parentRunId: run.parentRunId ?? null,
      sessionId: context.sessionId ?? null,
      status: run.status,
      startedAt: run.startedAt,
      ...(run.completedAt || terminal
        ? { endedAt: run.completedAt ?? event.timestamp }
        : {}),
      title: context.title ?? run.runId,
      acceptance:
        run.status === "awaiting_review" || run.status === "complete"
          ? "pending"
          : "none",
    });
    if (context.poolRunId && context.poolRunId !== "pool_unknown") {
      attachAgentRunToPoolRun(projectOSRoot, context.poolRunId, run.runId);
      if (terminal) {
        const pool = readAgentPoolRun(projectOSRoot, context.poolRunId);
        if (pool && pool.status === "running") {
          const failed =
            run.status === "error" ||
            event.type === "run_cancelled" ||
            event.type === "step_failed";
          writeAgentPoolRun(projectOSRoot, {
            ...pool,
            status: failed ? "partial" : "completed",
            endedAt: event.timestamp,
          });
        }
      }
    }
  } catch (error) {
    console.error("[projectos] agent-pool-index update failed", error);
  }
}
