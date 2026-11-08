import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import { ProjectOSError } from "../../errors.js";
import {
  createFileOutboundBudget,
  resolveOutboundBudgetFromEnv,
  OUTBOUND_BUDGET_LIMIT_ENV,
  OUTBOUND_BUDGET_PATH_ENV,
} from "./outbound-budget.js";

const here = dirname(fileURLToPath(import.meta.url));

function runBudgetWorker(
  scriptName: string,
  env: NodeJS.ProcessEnv,
): { status: number | null; stdout: string; stderr: string } {
  const viteNode = join(here, "../../node_modules/.bin/vite-node");
  const result = spawnSync(viteNode, [join(here, scriptName)], {
    env: { ...process.env, ...env },
    encoding: "utf8",
    cwd: join(here, "../.."),
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
});

function tempLedger(): string {
  const dir = mkdtempSync(join(tmpdir(), "pos-outbound-budget-"));
  dirs.push(dir);
  return join(dir, "ledger.json");
}

describe("resolveOutboundBudgetFromEnv", () => {
  it("returns null when both env vars are unset (daily default)", () => {
    expect(resolveOutboundBudgetFromEnv({})).toBeNull();
  });

  it("fail-closes when only one env var is set", () => {
    expect(() =>
      resolveOutboundBudgetFromEnv({ [OUTBOUND_BUDGET_PATH_ENV]: "/tmp/x" }),
    ).toThrow(ProjectOSError);
    expect(() =>
      resolveOutboundBudgetFromEnv({ [OUTBOUND_BUDGET_LIMIT_ENV]: "10" }),
    ).toThrow(ProjectOSError);
  });
});

describe("FileOutboundBudget", () => {
  it("reserves up to the limit then rejects without sending a slot", () => {
    const path = tempLedger();
    const budget = createFileOutboundBudget(path, 2);
    const a = budget.reserve();
    const b = budget.reserve();
    expect(a.reservationId).not.toBe(b.reservationId);
    try {
      budget.reserve();
      expect.unreachable("expected budget exhaustion");
    } catch (error) {
      expect(error).toBeInstanceOf(ProjectOSError);
      expect((error as ProjectOSError).code).toBe("model_outbound_budget_exhausted");
    }
    const snap = budget.snapshot();
    expect(snap.reservations).toHaveLength(2);
  });

  it("settle records outcome but never frees a slot (no refund)", () => {
    const path = tempLedger();
    const budget = createFileOutboundBudget(path, 1);
    const { reservationId } = budget.reserve();
    budget.settle(reservationId, {
      status: "failed",
      usageStatus: "missing",
      inputTokens: 0,
      outputTokens: 0,
    });
    expect(() => budget.reserve()).toThrow(/exhausted/i);
    const row = budget.snapshot().reservations[0]!;
    expect(row.state).toBe("settled");
    expect(row.status).toBe("failed");
  });

  it("stamps optional requestKind/model/provider audit meta at reserve and keeps it through settle/abort/error", () => {
    const path = tempLedger();
    const budget = createFileOutboundBudget(path, 3);
    const ok = budget.reserve({
      requestKind: "question_answer",
      model: "deepseek-chat",
      provider: "deepseek",
    });
    const cancelled = budget.reserve({
      requestKind: "request_intent",
      model: "deepseek-chat",
      provider: "deepseek",
    });
    const failed = budget.reserve({
      requestKind: "question_answer",
      model: "deepseek-chat",
    });
    budget.settle(ok.reservationId, {
      status: "ok",
      usageStatus: "reported",
      inputTokens: 12,
      outputTokens: 3,
    });
    budget.settle(cancelled.reservationId, {
      status: "cancelled",
      usageStatus: "missing",
      inputTokens: 0,
      outputTokens: 0,
    });
    budget.settle(failed.reservationId, {
      status: "failed",
      usageStatus: "missing",
      inputTokens: 0,
      outputTokens: 0,
    });
    const rows = budget.snapshot().reservations;
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      requestKind: "question_answer",
      model: "deepseek-chat",
      provider: "deepseek",
      status: "ok",
      usageStatus: "reported",
      inputTokens: 12,
      outputTokens: 3,
    });
    expect(rows[1]).toMatchObject({
      requestKind: "request_intent",
      status: "cancelled",
      usageStatus: "missing",
      inputTokens: 0,
      outputTokens: 0,
    });
    expect(rows[2]).toMatchObject({
      requestKind: "question_answer",
      status: "failed",
      usageStatus: "missing",
    });
    // Old ledgers without meta remain readable (backward compatible).
    const legacyPath = tempLedger();
    writeFileSync(
      legacyPath,
      `${JSON.stringify({
        version: 1,
        limit: 1,
        reservations: [
          {
            id: "obr_legacy",
            state: "settled",
            reservedAt: new Date().toISOString(),
            settledAt: new Date().toISOString(),
            status: "ok",
            usageStatus: "missing",
            inputTokens: 0,
            outputTokens: 0,
          },
        ],
      }, null, 2)}\n`,
    );
    const legacy = createFileOutboundBudget(legacyPath, 1);
    expect(legacy.snapshot().reservations[0]?.requestKind).toBeUndefined();
    expect(() => legacy.reserve()).toThrow(/exhausted/i);
  });

  it("annotates provider-reported usage onto the matching reservation id (not latest-wins)", () => {
    const path = tempLedger();
    const budget = createFileOutboundBudget(path, 3);
    const first = budget.reserve();
    const second = budget.reserve();
    budget.settle(first.reservationId, {
      status: "ok",
      usageStatus: "missing",
      inputTokens: 0,
      outputTokens: 0,
    });
    budget.settle(second.reservationId, {
      status: "ok",
      usageStatus: "missing",
      inputTokens: 0,
      outputTokens: 0,
    });
    // Interleaved completion: annotate the earlier attempt after the later one settled.
    expect(
      budget.annotateReservationUsage(first.reservationId, {
        inputTokens: 11,
        outputTokens: 2,
      }),
    ).toBe(true);
    expect(
      budget.annotateReservationUsage(second.reservationId, {
        inputTokens: 99,
        outputTokens: 7,
      }),
    ).toBe(true);
    const rows = budget.snapshot().reservations;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      id: first.reservationId,
      usageStatus: "reported",
      inputTokens: 11,
      outputTokens: 2,
    });
    expect(rows[1]).toMatchObject({
      id: second.reservationId,
      usageStatus: "reported",
      inputTokens: 99,
      outputTokens: 7,
    });
    // Failed attempts stay missing/zero and cannot be upgraded as ok usage.
    const failed = budget.reserve();
    budget.settle(failed.reservationId, {
      status: "failed",
      usageStatus: "missing",
      inputTokens: 0,
      outputTokens: 0,
    });
    expect(
      budget.annotateReservationUsage(failed.reservationId, {
        inputTokens: 5,
        outputTokens: 5,
      }),
    ).toBe(false);
  });

  it("survives process restart by reading the same durable ledger", () => {
    const path = tempLedger();
    const first = createFileOutboundBudget(path, 3);
    first.reserve();
    first.reserve();
    const second = createFileOutboundBudget(path, 3);
    expect(second.snapshot().reservations).toHaveLength(2);
    second.reserve();
    expect(() => second.reserve()).toThrow(/exhausted/i);
  });

  it("rejects concurrent over-reserve via exclusive lock", async () => {
    const path = tempLedger();
    const budget = createFileOutboundBudget(path, 5);
    const workers = Array.from({ length: 12 }, () =>
      Promise.resolve().then(() => {
        try {
          return { ok: true as const, id: budget.reserve().reservationId };
        } catch (error) {
          return {
            ok: false as const,
            code: error instanceof ProjectOSError ? error.code : "other",
          };
        }
      }),
    );
    const results = await Promise.all(workers);
    const reserved = results.filter((row) => row.ok);
    const rejected = results.filter((row) => !row.ok);
    expect(reserved).toHaveLength(5);
    expect(rejected.length).toBe(7);
    expect(
      rejected.every((row) => row.code === "model_outbound_budget_exhausted"),
    ).toBe(true);
    expect(budget.snapshot().reservations).toHaveLength(5);
  });

  it("fail-closes on corrupt ledger JSON", () => {
    const path = tempLedger();
    writeFileSync(path, "{not-json", "utf8");
    const budget = createFileOutboundBudget(path, 2);
    expect(() => budget.reserve()).toThrow(ProjectOSError);
    expect(() => budget.reserve()).toThrow(/corrupt/i);
  });

  it("fail-closes when configured limit disagrees with ledger limit", () => {
    const path = tempLedger();
    const first = createFileOutboundBudget(path, 2);
    first.reserve();
    const second = createFileOutboundBudget(path, 5);
    expect(() => second.reserve()).toThrow(/does not match/i);
    // Original ledger untouched length.
    expect(JSON.parse(readFileSync(path, "utf8")).reservations).toHaveLength(1);
  });

  it("truly parallel child processes cannot exceed the shared durable ledger limit", async () => {
    const path = tempLedger();
    writeFileSync(
      path,
      JSON.stringify({ version: 1, limit: 4, reservations: [] }, null, 2),
      "utf8",
    );
    const viteNode = join(here, "../../node_modules/.bin/vite-node");
    const script = join(here, "outbound-budget-cross-process-worker.ts");
    const children = Array.from({ length: 3 }, () =>
      spawn(viteNode, [script], {
        env: {
          ...process.env,
          LEDGER_PATH: path,
          LEDGER_LIMIT: "4",
          ATTEMPTS: "8",
        },
        cwd: join(here, "../.."),
      }),
    );
    const results = await Promise.all(
      children.map(
        (child) =>
          new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve) => {
            let stdout = "";
            let stderr = "";
            child.stdout.on("data", (chunk) => {
              stdout += String(chunk);
            });
            child.stderr.on("data", (chunk) => {
              stderr += String(chunk);
            });
            child.on("close", (status) => resolve({ status, stdout, stderr }));
          }),
      ),
    );
    for (const result of results) {
      expect(result.status, result.stderr).toBe(0);
    }
    const parsed = results.map((result) => JSON.parse(result.stdout.trim()));
    const totalOk = parsed.reduce((sum, row) => sum + row.ok, 0);
    const totalOther = parsed.reduce((sum, row) => sum + row.other, 0);
    expect(totalOk).toBe(4);
    expect(totalOther).toBe(0);
    expect(JSON.parse(readFileSync(path, "utf8")).reservations).toHaveLength(4);
  });

  it("corrupt ledger keeps fail-closed across process restart", () => {
    const path = tempLedger();
    const budget = createFileOutboundBudget(path, 2);
    budget.reserve();
    writeFileSync(path, "{broken", "utf8");
    const probe = runBudgetWorker("outbound-budget-corrupt-probe-worker.ts", {
      LEDGER_PATH: path,
    });
    expect(probe.status, probe.stderr).toBe(0);
    expect(probe.stdout.trim()).toBe("model_outbound_budget_unavailable");
  });
});
