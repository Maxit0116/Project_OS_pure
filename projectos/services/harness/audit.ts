import { createHash, randomUUID } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { z } from "zod";

import type { ExecCommand } from "../../contracts/exec-command.js";
import {
  containsHighConfidenceSecret,
  redactHighConfidenceSecrets,
} from "../high-confidence-secret-patterns.js";

const AuditApprovalSchema = z.object({
  approvalId: z.string().min(1).max(80),
  at: z.string().min(1),
  runId: z.string().min(1).max(80).optional(),
  tool: z.string().min(1).max(80),
  decision: z.enum(["allow", "deny"]),
  match: z.string().min(1).max(200).optional(),
  commandSetHash: z.string().regex(/^sha256:[a-f0-9]{64}$/u).optional(),
  pathHash: z.string().regex(/^sha256:[a-f0-9]{64}$/u).optional(),
}).strict();

export type AuditApproval = z.infer<typeof AuditApprovalSchema>;

const AUDIT_FILE = "approvals.jsonl";

export function recordAuditApproval(
  directory: string,
  input: {
    runId?: string;
    tool: string;
    decision: "allow" | "deny";
    match?: string;
    commandSetHash?: string;
    pathHash?: string;
  },
): AuditApproval {
  const match = scrubMatch(input.match);
  const record = AuditApprovalSchema.parse({
    approvalId: `audit_${randomUUID()}`,
    at: new Date().toISOString(),
    tool: input.tool.slice(0, 80),
    decision: input.decision,
    ...(input.runId ? { runId: input.runId.slice(0, 80) } : {}),
    ...(match ? { match } : {}),
    ...(input.commandSetHash ? { commandSetHash: input.commandSetHash } : {}),
    ...(input.pathHash ? { pathHash: input.pathHash } : {}),
  });
  mkdirSync(directory, { recursive: true });
  appendFileSync(join(directory, AUDIT_FILE), `${JSON.stringify(record)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  return record;
}

export function readAuditApprovals(directory: string): AuditApproval[] {
  const path = join(directory, AUDIT_FILE);
  if (!existsSync(path)) return [];
  const records: AuditApproval[] = [];
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const parsed = AuditApprovalSchema.safeParse(JSON.parse(line) as unknown);
      if (parsed.success) records.push(parsed.data);
    } catch {
      // A damaged line is not an approval.
    }
  }
  return records;
}

export function latestAllow(
  directory: string,
  commandSetHash: string,
): AuditApproval | undefined {
  return [...readAuditApprovals(directory)].reverse().find((record) =>
    record.decision === "allow" && record.commandSetHash === commandSetHash,
  );
}

/** An allow that was never written down is not an approval. */
export function recordedAllow(record: AuditApproval | undefined): boolean {
  return record?.decision === "allow" && typeof record.approvalId === "string";
}

export function hashAuditPath(value: string): string {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

export function shellCommandHash(command: ExecCommand): string {
  return hashAuditPath(canonicalJson({
    command: command.command,
    args: command.args,
  }));
}

export function redactAuditText(value: string): string {
  const single = value.replaceAll(/[\r\n]/gu, " ").trim();
  const redacted = redactHighConfidenceSecrets(single).trim();
  return redacted.length > 0 ? redacted.slice(0, 2_048) : "redacted";
}

/** Workspace-relative path. Absolute paths outside the workspace become `[PATH]`. */
export function workspaceRelativePath(workspaceRoot: string, path: string): string {
  const normalized = path.replaceAll("\\", "/");
  if (containsHighConfidenceSecret(normalized)) return "[PATH]";
  if (!normalized.startsWith("/") && !/^[A-Za-z]:/.test(normalized)) {
    return normalized.replace(/^\.\//u, "");
  }
  const root = resolve(workspaceRoot);
  const target = resolve(workspaceRoot, path);
  const rel = relative(root, target).replaceAll("\\", "/");
  if (rel.startsWith("..") || rel === "") return "[PATH]";
  return rel;
}

function scrubMatch(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const single = value.replaceAll(/[\r\n]/gu, " ").trim();
  if (!single || containsHighConfidenceSecret(single)) return undefined;
  return single.slice(0, 200);
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
