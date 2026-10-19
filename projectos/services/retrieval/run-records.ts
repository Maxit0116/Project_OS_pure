import { readFileSync } from "node:fs";
import { join } from "node:path";

import { containsHighConfidenceSecret } from "../high-confidence-secret-patterns.js";
import { listJsonlFiles } from "./code-index.js";

export interface RunRecordHit {
  runId: string;
  path: string;
  objective: string;
  verification: "passed" | "failed" | "not_run" | "unknown";
  files: number;
  corpus: "run_record" | "run_record_failed";
}

/** Sanitized projections only. Rationale, diffs, and provider reasoning are ignored. */
export function searchRunRecords(projectOSRoot: string, query: string): RunRecordHit[] {
  const needle = query.trim();
  if (!needle) return [];
  const hits: RunRecordHit[] = [];
  const files = listJsonlFiles(join(projectOSRoot, "agent-runs")).slice(-40);
  for (const file of files) {
    let raw = "";
    try {
      raw = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    const plans = new Map<string, { path: string; objective: string }>();
    const verification = new Map<string, RunRecordHit["verification"]>();
    const fileCounts = new Map<string, number>();
    const failed = new Set<string>();
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      let event: {
        type?: string;
        runId?: string;
        payload?: {
          path?: string;
          objective?: string;
          status?: string;
          outcome?: string;
          files?: unknown[];
        };
      };
      try {
        event = JSON.parse(line) as typeof event;
      } catch {
        continue;
      }
      if (!event.runId || !event.type) continue;
      if (event.type === "edit_plan_created" && event.payload?.path && event.payload.objective) {
        plans.set(event.runId, {
          path: event.payload.path,
          objective: event.payload.objective,
        });
      }
      if (event.type === "diff_proposed" && Array.isArray(event.payload?.files)) {
        fileCounts.set(event.runId, event.payload.files.length);
      }
      if (event.type === "verification_result" && event.payload?.status) {
        const status = event.payload.status;
        if (status === "passed" || status === "failed" || status === "not_run") {
          verification.set(event.runId, status);
        }
      }
      if (event.type === "apply_result" && event.payload?.outcome && event.payload.outcome !== "applied") {
        failed.add(event.runId);
      }
    }
    for (const [runId, plan] of plans) {
      const blob = `${runId} ${plan.path} ${plan.objective}`;
      if (!blob.includes(needle)) continue;
      if (containsHighConfidenceSecret(plan.objective)) continue;
      hits.push({
        runId,
        path: plan.path,
        objective: plan.objective,
        verification: verification.get(runId) ?? "unknown",
        files: fileCounts.get(runId) ?? 0,
        corpus: failed.has(runId) ? "run_record_failed" : "run_record",
      });
    }
  }
  return hits;
}
