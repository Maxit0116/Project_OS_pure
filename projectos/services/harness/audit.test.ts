import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  hashAuditPath,
  latestAllow,
  readAuditApprovals,
  recordAuditApproval,
  redactAuditText,
  shellCommandHash,
  workspaceRelativePath,
} from "./audit.js";

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("governance audit log", () => {
  it("keeps an allow after a new reader opens the same directory", () => {
    const directory = mkdtempSync(join(tmpdir(), "pos-audit-"));
    temporaryRoots.push(directory);
    const commandSetHash = hashAuditPath("npm test");
    recordAuditApproval(directory, {
      tool: "run_verification",
      decision: "allow",
      commandSetHash,
    });

    expect(latestAllow(directory, commandSetHash)?.decision).toBe("allow");
    const empty = mkdtempSync(join(tmpdir(), "pos-audit-empty-"));
    temporaryRoots.push(empty);
    expect(latestAllow(empty, commandSetHash)).toBeUndefined();
  });

  it("does not treat a damaged line or a secret as an approval", () => {
    const directory = mkdtempSync(join(tmpdir(), "pos-audit-"));
    temporaryRoots.push(directory);
    const secret = `sk-${"b".repeat(24)}`;
    writeFileSync(join(directory, "approvals.jsonl"), `not-json\n{"decision":"allow"}\n`, "utf8");
    const recorded = recordAuditApproval(directory, {
      tool: "shell",
      decision: "deny",
      match: secret,
      commandSetHash: shellCommandHash({
        command: "npm",
        args: ["test"],
        timeoutMs: 1_000,
      }),
    });

    expect(readAuditApprovals(directory)).toEqual([recorded]);
    expect(JSON.stringify(recorded)).not.toContain(secret);
    expect(redactAuditText(`Denied ${secret}`)).not.toContain(secret);
  });

  it("stores workspace-relative paths and drops paths outside the workspace", () => {
    expect(workspaceRelativePath("/work/app", "/work/app/src/a.ts")).toBe("src/a.ts");
    expect(workspaceRelativePath("/work/app", "src/a.ts")).toBe("src/a.ts");
    expect(workspaceRelativePath("/work/app", "/etc/passwd")).toBe("[PATH]");
  });
});
