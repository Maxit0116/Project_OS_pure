/**
 * Opt-in hard budget for real provider outbounds.
 *
 * Enabled only when both env vars are set:
 *   PROJECTOS_MODEL_OUTBOUND_BUDGET_PATH  — durable ledger JSON path
 *   PROJECTOS_MODEL_OUTBOUND_BUDGET_LIMIT — positive integer
 *
 * Daily/normal desktop runs omit these vars and are unaffected.
 *
 * Reserve is atomic (exclusive lock file) and consumed permanently — settle
 * records outcome/usage only and never frees a slot (no refunds that could
 * allow a second send after a failed attempt). Lock failure or corrupt ledger
 * rejects the outbound fail-closed.
 */
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { dirname, resolve } from "node:path";

import { ProjectOSError } from "../../errors.js";

export const OUTBOUND_BUDGET_PATH_ENV = "PROJECTOS_MODEL_OUTBOUND_BUDGET_PATH";
export const OUTBOUND_BUDGET_LIMIT_ENV = "PROJECTOS_MODEL_OUTBOUND_BUDGET_LIMIT";

const LEDGER_VERSION = 1 as const;
const LOCK_STALE_MS = 30_000;
const LOCK_RETRY_MS = 20;
const LOCK_MAX_ATTEMPTS = 100;

export type OutboundReservationState = "reserved" | "settled";

/** Optional audit fields stamped at reserve time (never secrets/prompts/paths). */
export interface OutboundReservationAuditMeta {
  requestKind?: string;
  model?: string;
  provider?: string;
}

export interface OutboundReservationRecord extends OutboundReservationAuditMeta {
  id: string;
  state: OutboundReservationState;
  reservedAt: string;
  settledAt?: string;
  /** Outcome after the provider attempt finished (or failed before HTTP). */
  status?: "ok" | "failed" | "cancelled";
  usageStatus?: "reported" | "missing";
  inputTokens?: number;
  outputTokens?: number;
}

export interface OutboundBudgetLedger {
  version: typeof LEDGER_VERSION;
  limit: number;
  reservations: OutboundReservationRecord[];
}

export interface OutboundBudgetSettleInput {
  status: "ok" | "failed" | "cancelled";
  usageStatus: "reported" | "missing";
  inputTokens: number;
  outputTokens: number;
}

export interface OutboundBudgetGate {
  readonly path: string;
  readonly limit: number;
  /** Atomically consume one slot. Throws if exhausted or ledger unavailable. */
  reserve(meta?: OutboundReservationAuditMeta): { reservationId: string };
  /** Record outcome; never frees the reserved slot. */
  settle(reservationId: string, outcome: OutboundBudgetSettleInput): void;
  /**
   * Upgrade a specific settled reservation with provider-reported tokens.
   * Fetch settles before body parse (usageStatus=missing); gateway fills by id.
   * Never adds/frees slots.
   */
  annotateReservationUsage(
    reservationId: string,
    usage: { inputTokens: number; outputTokens: number },
  ): boolean;
  snapshot(): OutboundBudgetLedger;
}

function sleepSync(ms: number): void {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    /* spin — reserve path must stay sync for atomic fs critical section */
  }
}

function isPidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function parseLimit(raw: string | undefined): number | null {
  if (raw === undefined || raw.trim() === "") return null;
  if (!/^\d+$/u.test(raw.trim())) return null;
  const n = Number(raw.trim());
  if (!Number.isInteger(n) || n <= 0 || n > 1_000_000) return null;
  return n;
}

export function resolveOutboundBudgetFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): OutboundBudgetGate | null {
  const pathRaw = env[OUTBOUND_BUDGET_PATH_ENV]?.trim();
  const limit = parseLimit(env[OUTBOUND_BUDGET_LIMIT_ENV]);
  if (!pathRaw && limit === null) return null;
  if (!pathRaw || limit === null) {
    throw new ProjectOSError(
      "model_outbound_budget_unavailable",
      `${OUTBOUND_BUDGET_PATH_ENV} and ${OUTBOUND_BUDGET_LIMIT_ENV} must both be set for opt-in outbound budget`,
    );
  }
  return createFileOutboundBudget(resolve(pathRaw), limit);
}

export function createFileOutboundBudget(
  ledgerPath: string,
  limit: number,
): OutboundBudgetGate {
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new ProjectOSError(
      "model_outbound_budget_unavailable",
      "Outbound budget limit must be a positive integer",
    );
  }
  const absolute = resolve(ledgerPath);
  mkdirSync(dirname(absolute), { recursive: true });
  const lockPath = `${absolute}.lock`;

  const withLock = <T>(fn: () => T): T => {
    for (let attempt = 0; attempt < LOCK_MAX_ATTEMPTS; attempt += 1) {
      let fd: number | undefined;
      try {
        fd = openSync(lockPath, "wx");
        // Stamp before any other work so peers never see an empty lock as "stale".
        writeSync(fd, `${process.pid}\n${Date.now()}\n`);
      } catch (error) {
        const code =
          error && typeof error === "object" && "code" in error
            ? String((error as { code?: unknown }).code)
            : "";
        if (code !== "EEXIST") {
          if (fd !== undefined) {
            try {
              closeSync(fd);
            } catch {
              /* ignore */
            }
            try {
              unlinkSync(lockPath);
            } catch {
              /* ignore */
            }
          }
          throw new ProjectOSError(
            "model_outbound_budget_unavailable",
            "Outbound budget lock failed",
            { cause: error },
          );
        }
        // Stale lock reclaim: dead holder, or aged stamp. Never treat an empty /
        // partial stamp as instantly stale — that races the creator's first write.
        try {
          if (existsSync(lockPath)) {
            let pid = 0;
            let stampedAt = 0;
            try {
              const lines = readFileSync(lockPath, "utf8").split("\n");
              pid = Number(lines[0] ?? "0");
              stampedAt = Number(lines[1] ?? "0");
            } catch {
              pid = 0;
              stampedAt = 0;
            }
            const hasStamp = Number.isFinite(stampedAt) && stampedAt > 0;
            const age = hasStamp ? Date.now() - stampedAt : 0;
            const holderDead = pid > 0 && !isPidAlive(pid);
            const stampExpired = hasStamp && age > LOCK_STALE_MS;
            if (holderDead || stampExpired) {
              try {
                unlinkSync(lockPath);
              } catch {
                /* raced */
              }
              continue;
            }
          }
        } catch {
          /* fall through to retry */
        }
        sleepSync(LOCK_RETRY_MS);
        continue;
      }
      try {
        // Domain errors from fn (exhausted/corrupt) must propagate untouched.
        return fn();
      } finally {
        try {
          closeSync(fd);
        } catch {
          /* ignore */
        }
        try {
          unlinkSync(lockPath);
        } catch {
          /* ignore */
        }
      }
    }
    throw new ProjectOSError(
      "model_outbound_budget_unavailable",
      "Outbound budget lock could not be acquired",
    );
  };

  const readLedgerUnlocked = (): OutboundBudgetLedger => {
    if (!existsSync(absolute)) {
      return { version: LEDGER_VERSION, limit, reservations: [] };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(absolute, "utf8")) as unknown;
    } catch (error) {
      throw new ProjectOSError(
        "model_outbound_budget_unavailable",
        "Outbound budget ledger is corrupt (JSON)",
        { cause: error },
      );
    }
    if (
      !parsed ||
      typeof parsed !== "object" ||
      Array.isArray(parsed) ||
      (parsed as OutboundBudgetLedger).version !== LEDGER_VERSION ||
      typeof (parsed as OutboundBudgetLedger).limit !== "number" ||
      !Array.isArray((parsed as OutboundBudgetLedger).reservations)
    ) {
      throw new ProjectOSError(
        "model_outbound_budget_unavailable",
        "Outbound budget ledger is corrupt (schema)",
      );
    }
    const ledger = parsed as OutboundBudgetLedger;
    // Limit is fixed at gate construction; mismatch means tamper/wrong env.
    if (ledger.limit !== limit) {
      throw new ProjectOSError(
        "model_outbound_budget_unavailable",
        `Outbound budget ledger limit ${ledger.limit} does not match configured ${limit}`,
      );
    }
    for (const row of ledger.reservations) {
      if (
        !row ||
        typeof row.id !== "string" ||
        !row.id ||
        (row.state !== "reserved" && row.state !== "settled") ||
        typeof row.reservedAt !== "string"
      ) {
        throw new ProjectOSError(
          "model_outbound_budget_unavailable",
          "Outbound budget ledger is corrupt (reservation row)",
        );
      }
    }
    return {
      version: LEDGER_VERSION,
      limit: ledger.limit,
      reservations: ledger.reservations.map((row) => ({ ...row })),
    };
  };

  const writeLedgerUnlocked = (ledger: OutboundBudgetLedger): void => {
    const tmp = `${absolute}.${process.pid}.${Date.now()}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
    renameSync(tmp, absolute);
  };

  return {
    path: absolute,
    limit,
    reserve(meta?: OutboundReservationAuditMeta): { reservationId: string } {
      return withLock(() => {
        const ledger = readLedgerUnlocked();
        if (ledger.reservations.length >= ledger.limit) {
          throw new ProjectOSError(
            "model_outbound_budget_exhausted",
            `Model outbound budget exhausted (${ledger.reservations.length}/${ledger.limit}); request not sent`,
            {
              details: {
                reserved: ledger.reservations.length,
                limit: ledger.limit,
                path: absolute,
              },
            },
          );
        }
        const reservationId = `obr_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
        const requestKind =
          typeof meta?.requestKind === "string" && meta.requestKind.trim()
            ? meta.requestKind.trim().slice(0, 64)
            : undefined;
        const model =
          typeof meta?.model === "string" && meta.model.trim()
            ? meta.model.trim().slice(0, 128)
            : undefined;
        const provider =
          typeof meta?.provider === "string" && meta.provider.trim()
            ? meta.provider.trim().slice(0, 64)
            : undefined;
        ledger.reservations.push({
          id: reservationId,
          state: "reserved",
          reservedAt: new Date().toISOString(),
          ...(requestKind ? { requestKind } : {}),
          ...(model ? { model } : {}),
          ...(provider ? { provider } : {}),
        });
        writeLedgerUnlocked(ledger);
        return { reservationId };
      });
    },
    settle(reservationId: string, outcome: OutboundBudgetSettleInput): void {
      withLock(() => {
        const ledger = readLedgerUnlocked();
        const row = ledger.reservations.find((item) => item.id === reservationId);
        if (!row) {
          // Unknown id: fail-closed for settle callers that expect bookkeeping,
          // but do not free any slot.
          throw new ProjectOSError(
            "model_outbound_budget_unavailable",
            `Outbound budget reservation '${reservationId}' was not found`,
          );
        }
        row.state = "settled";
        row.settledAt = new Date().toISOString();
        row.status = outcome.status;
        row.usageStatus = outcome.usageStatus;
        row.inputTokens = outcome.inputTokens;
        row.outputTokens = outcome.outputTokens;
        writeLedgerUnlocked(ledger);
      });
    },
    annotateReservationUsage(
      reservationId: string,
      usage: { inputTokens: number; outputTokens: number },
    ): boolean {
      return withLock(() => {
        const ledger = readLedgerUnlocked();
        const row = ledger.reservations.find((item) => item.id === reservationId);
        if (!row || row.state !== "settled" || row.status !== "ok") return false;
        // Only fill tokens that were deferred as missing at fetch settle time.
        if (row.usageStatus !== "missing") return false;
        row.usageStatus = "reported";
        row.inputTokens = usage.inputTokens;
        row.outputTokens = usage.outputTokens;
        writeLedgerUnlocked(ledger);
        return true;
      });
    },
    snapshot(): OutboundBudgetLedger {
      return withLock(() => readLedgerUnlocked());
    },
  };
}
