import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
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
import { cloneJson } from "../../utils/json.js";

function safeId(value: string): boolean {
  return value.length > 0 && value.length <= 200 && !/[\\/\.\0]/u.test(value);
}

function atomicJsonWrite(filePath: string, value: unknown): void {
  const tempPath = `${filePath}.tmp-${process.pid}`;
  writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  renameSync(tempPath, filePath);
}

export class DurableRunStateStore {
  private readonly decisionsRoot: string;
  private readonly checkpointsRoot: string;

  constructor(projectOSRoot: string) {
    this.decisionsRoot = join(projectOSRoot, "run-decisions");
    this.checkpointsRoot = join(projectOSRoot, "run-checkpoints");
    mkdirSync(this.decisionsRoot, { recursive: true });
    mkdirSync(this.checkpointsRoot, { recursive: true });
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
    atomicJsonWrite(join(this.checkpointsRoot, `${parsed.id}.json`), parsed);
    return cloneJson(parsed);
  }

  loadCheckpoint(checkpointId: string): RunCheckpoint | null {
    if (!safeId(checkpointId)) return null;
    const filePath = join(this.checkpointsRoot, `${checkpointId}.json`);
    if (!existsSync(filePath)) return null;
    return RunCheckpointSchema.parse(JSON.parse(readFileSync(filePath, "utf8")));
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
