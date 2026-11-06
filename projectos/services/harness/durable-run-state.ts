import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  RunBudgetSchema,
  RunCheckpointSchema,
  RunDecisionSchema,
  type RunBudget,
  type RunBudgetUsage,
  type RunCheckpoint,
  type RunDecision,
} from "../../contracts/run-state.js";
import { RequestIntentSchema, type RequestIntent } from "../../contracts/request-intent.js";
import { z } from "zod";
import { cloneJson } from "../../utils/json.js";

function safeId(value: string): boolean {
  return value.length > 0 && value.length <= 200 && !/[\\/\.\0]/u.test(value);
}

function atomicJsonWrite(filePath: string, value: unknown): void {
  const tempPath = `${filePath}.tmp-${process.pid}`;
  writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  renameSync(tempPath, filePath);
}

const IntentExecutionBindingSchema = z.object({
  version: z.literal("0.1.0"),
  projectId: z.string().min(1),
  intentId: z.string().min(1),
  intentRevision: z.number().int().positive(),
  rootRunId: z.string().min(1),
  createdAt: z.string().min(1),
}).strict();

export type IntentExecutionBinding = z.infer<typeof IntentExecutionBindingSchema>;

export class DurableRunStateStore {
  private readonly decisionsRoot: string;
  private readonly checkpointsRoot: string;
  private readonly intentsRoot: string;
  private readonly runStartsRoot: string;

  constructor(projectOSRoot: string) {
    this.decisionsRoot = join(projectOSRoot, "run-decisions");
    this.checkpointsRoot = join(projectOSRoot, "run-checkpoints");
    this.intentsRoot = join(projectOSRoot, "run-intents");
    this.runStartsRoot = join(projectOSRoot, "run-starts");
    mkdirSync(this.decisionsRoot, { recursive: true });
    mkdirSync(this.checkpointsRoot, { recursive: true });
    mkdirSync(this.intentsRoot, { recursive: true });
    mkdirSync(this.runStartsRoot, { recursive: true });
  }

  saveDecision(decision: RunDecision): RunDecision {
    const parsed = RunDecisionSchema.parse(decision);
    if (!safeId(parsed.id)) throw new Error("Unsafe decision id");
    atomicJsonWrite(join(this.decisionsRoot, `${parsed.id}.json`), parsed);
    return cloneJson(parsed);
  }

  loadDecision(decisionId: string): RunDecision | null {
    if (!safeId(decisionId)) return null;
    const filePath = join(this.decisionsRoot, `${decisionId}.json`);
    if (!existsSync(filePath)) return null;
    return RunDecisionSchema.parse(JSON.parse(readFileSync(filePath, "utf8")));
  }

  listDecisions(rootRunId: string): RunDecision[] {
    if (!safeId(rootRunId)) return [];
    return readdirSync(this.decisionsRoot)
      .filter((name) => name.endsWith(".json"))
      .map((name) => this.loadDecision(name.slice(0, -".json".length)))
      .filter((decision): decision is RunDecision => decision?.rootRunId === rootRunId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  resolveDecision(
    decisionId: string,
    expectedRevision: number,
    answer: { optionId: string; text?: string },
    status: "resolved" | "declined" = "resolved",
  ): RunDecision {
    const current = this.loadDecision(decisionId);
    if (!current) throw new Error(`Decision '${decisionId}' was not found`);
    if (current.revision !== expectedRevision) throw new Error("Decision is stale");
    if (current.status !== "pending") throw new Error("Decision is no longer pending");
    if (!current.options.some((option) => option.id === answer.optionId)) {
      throw new Error("Decision answer is not one of the available options");
    }
    return this.saveDecision({
      ...current,
      status,
      revision: current.revision + 1,
      answer,
      resolvedAt: new Date().toISOString(),
    });
  }

  saveCheckpoint(checkpoint: RunCheckpoint): RunCheckpoint {
    const parsed = RunCheckpointSchema.parse(checkpoint);
    if (!safeId(parsed.id)) throw new Error("Unsafe checkpoint id");
    this.validateCheckpointDecisions(parsed, true);
    atomicJsonWrite(join(this.checkpointsRoot, `${parsed.id}.json`), parsed);
    return cloneJson(parsed);
  }

  loadCheckpoint(checkpointId: string): RunCheckpoint | null {
    if (!safeId(checkpointId)) return null;
    const filePath = join(this.checkpointsRoot, `${checkpointId}.json`);
    if (!existsSync(filePath)) return null;
    const checkpoint = RunCheckpointSchema.parse(JSON.parse(readFileSync(filePath, "utf8")));
    this.validateCheckpointDecisions(checkpoint, false);
    return checkpoint;
  }

  private validateCheckpointDecisions(checkpoint: RunCheckpoint, requirePending: boolean): void {
    for (const decisionId of checkpoint.pendingDecisionIds) {
      const decision = this.loadDecision(decisionId);
      if (!decision || decision.projectId !== checkpoint.projectId ||
        decision.rootRunId !== checkpoint.rootRunId || requirePending && decision.status !== "pending") {
        throw new Error(requirePending
          ? `Checkpoint references a missing, resolved, or foreign pending decision '${decisionId}'`
          : `Checkpoint references a missing or foreign decision '${decisionId}'`);
      }
    }
  }

  saveIntent(intent: RequestIntent): RequestIntent {
    const parsed = RequestIntentSchema.parse(intent);
    if (!safeId(parsed.id)) throw new Error("Unsafe intent id");
    atomicJsonWrite(join(this.intentsRoot, `${parsed.id}.json`), parsed);
    return cloneJson(parsed);
  }

  approveIntent(intentId: string, expectedRevision: number, approved: RequestIntent): RequestIntent {
    const existing = this.loadIntent(intentId);
    if (!existing) throw new Error(`Intent '${intentId}' was not found`);
    if (existing.revision !== expectedRevision) throw new Error("Intent revision is stale");
    if (existing.status !== "draft") throw new Error("Intent is no longer a draft");
    if (approved.id !== existing.id || approved.revision !== existing.revision || approved.status !== "approved") {
      throw new Error("Approved intent does not match the current draft");
    }
    return this.saveIntent(approved);
  }

  loadIntent(intentId: string): RequestIntent | null {
    if (!safeId(intentId)) return null;
    const filePath = join(this.intentsRoot, `${intentId}.json`);
    if (!existsSync(filePath)) return null;
    return RequestIntentSchema.parse(JSON.parse(readFileSync(filePath, "utf8")));
  }

  bindIntentExecution(
    projectId: string,
    intentId: string,
    intentRevision: number,
    proposedRootRunId: string,
  ): IntentExecutionBinding {
    if (!safeId(intentId) || !safeId(proposedRootRunId)) throw new Error("Unsafe intent execution binding id");
    const binding = IntentExecutionBindingSchema.parse({
      version: "0.1.0",
      projectId,
      intentId,
      intentRevision,
      rootRunId: proposedRootRunId,
      createdAt: new Date().toISOString(),
    });
    const filePath = join(this.runStartsRoot, `${intentId}_${intentRevision}.json`);
    let fd: number | undefined;
    try {
      fd = openSync(filePath, "wx", 0o600);
      writeFileSync(fd, `${JSON.stringify(binding, null, 2)}\n`, "utf8");
      fsyncSync(fd);
      closeSync(fd);
      return binding;
    } catch (error) {
      if (fd !== undefined) closeSync(fd);
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const existing = IntentExecutionBindingSchema.parse(JSON.parse(readFileSync(filePath, "utf8")));
      if (existing.projectId !== projectId || existing.intentId !== intentId ||
        existing.intentRevision !== intentRevision) {
        throw new Error("Intent execution binding identity does not match its storage key");
      }
      return existing;
    }
  }

  loadIntentExecutionBinding(
    projectId: string,
    intentId: string,
    intentRevision: number,
  ): IntentExecutionBinding | null {
    if (!safeId(intentId)) return null;
    const filePath = join(this.runStartsRoot, `${intentId}_${intentRevision}.json`);
    if (!existsSync(filePath)) return null;
    const binding = IntentExecutionBindingSchema.parse(JSON.parse(readFileSync(filePath, "utf8")));
    if (binding.projectId !== projectId || binding.intentId !== intentId ||
      binding.intentRevision !== intentRevision) return null;
    return binding;
  }
}

export interface BudgetReservation {
  id: string;
  concurrency: number;
  activeTimeMs: number;
  inputTokens: number;
  outputTokens: number;
  spendCents: number;
}

type ActualRunUsage = Pick<
  RunBudgetUsage,
  "activeTimeMs" | "inputTokens" | "outputTokens" | "spendCents"
>;

export class RootBudgetLedger {
  private readonly reservations = new Map<string, BudgetReservation>();
  private readonly budget: RunBudget;
  private usage: RunBudgetUsage = {
    activeTimeMs: 0,
    inputTokens: 0,
    outputTokens: 0,
    spendCents: 0,
    reservedActiveTimeMs: 0,
    reservedInputTokens: 0,
    reservedOutputTokens: 0,
    reservedSpendCents: 0,
    reservedConcurrency: 0,
  };

  constructor(budget: RunBudget) {
    this.budget = RunBudgetSchema.parse(budget);
  }

  reserve(request: Omit<BudgetReservation, "id"> & { id: string }): BudgetReservation {
    const existing = this.reservations.get(request.id);
    if (existing) {
      if (JSON.stringify(existing) !== JSON.stringify(request)) {
        throw new Error(`Budget reservation '${request.id}' already exists with different limits`);
      }
      return cloneJson(existing);
    }
    const nextConcurrency = this.usage.reservedConcurrency + request.concurrency;
    const nextActiveTime =
      this.usage.activeTimeMs +
      this.usage.reservedActiveTimeMs +
      request.activeTimeMs;
    const nextInput =
      this.usage.inputTokens +
      this.usage.reservedInputTokens +
      request.inputTokens;
    const nextOutput =
      this.usage.outputTokens +
      this.usage.reservedOutputTokens +
      request.outputTokens;
    const nextSpend =
      this.usage.spendCents +
      this.usage.reservedSpendCents +
      request.spendCents;
    if (nextConcurrency > this.budget.maxConcurrency ||
      (this.budget.maxActiveTimeMs !== undefined && nextActiveTime > this.budget.maxActiveTimeMs) ||
      (this.budget.maxInputTokens !== undefined && nextInput > this.budget.maxInputTokens) ||
      (this.budget.maxOutputTokens !== undefined && nextOutput > this.budget.maxOutputTokens) ||
      (this.budget.maxSpendCents !== undefined && nextSpend > this.budget.maxSpendCents)) {
      throw new Error("Root run budget exhausted");
    }
    const reservation = { ...request };
    this.reservations.set(request.id, reservation);
    this.usage = {
      ...this.usage,
      reservedActiveTimeMs: this.usage.reservedActiveTimeMs + request.activeTimeMs,
      reservedInputTokens: this.usage.reservedInputTokens + request.inputTokens,
      reservedOutputTokens: this.usage.reservedOutputTokens + request.outputTokens,
      reservedSpendCents: this.usage.reservedSpendCents + request.spendCents,
      reservedConcurrency: nextConcurrency,
    };
    return cloneJson(reservation);
  }

  reconcile(reservationId: string, usage: ActualRunUsage): RunBudgetUsage {
    const reservation = this.reservations.get(reservationId);
    if (!reservation) throw new Error(`Budget reservation '${reservationId}' was not found`);
    this.reservations.delete(reservationId);
    this.usage = {
      activeTimeMs: this.usage.activeTimeMs + usage.activeTimeMs,
      inputTokens: this.usage.inputTokens + usage.inputTokens,
      outputTokens: this.usage.outputTokens + usage.outputTokens,
      spendCents: this.usage.spendCents + usage.spendCents,
      reservedActiveTimeMs: this.usage.reservedActiveTimeMs - reservation.activeTimeMs,
      reservedInputTokens: this.usage.reservedInputTokens - reservation.inputTokens,
      reservedOutputTokens: this.usage.reservedOutputTokens - reservation.outputTokens,
      reservedSpendCents: this.usage.reservedSpendCents - reservation.spendCents,
      reservedConcurrency: this.usage.reservedConcurrency - reservation.concurrency,
    };
    return cloneJson(this.usage);
  }

  snapshot(): RunBudgetUsage {
    return cloneJson(this.usage);
  }
}
