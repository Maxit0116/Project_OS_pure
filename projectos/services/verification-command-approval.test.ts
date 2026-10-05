import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { FileVerificationCommandApprovalStore } from
  "../persistence/verification-command-approval-store.js";
import { VerificationCommandApprovalService } from
  "./verification-command-approval.js";

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("VerificationCommandApprovalService", () => {
  it("persists trust outside the project and binds it to root, project, and exact commands", async () => {
    const userDataRoot = mkdtempSync(join(tmpdir(), "projectos-verification-trust-"));
    temporaryRoots.push(userDataRoot);
    const input = {
      projectId: "project-a",
      canonicalWorkspaceRoot: "/workspaces/project-a",
      commands: [{ command: "npm", args: ["test"], timeoutMs: 10_000 }],
    };
    const service = new VerificationCommandApprovalService(
      new FileVerificationCommandApprovalStore(userDataRoot),
    );

    const pending = await service.inspect(input);
    expect(pending.status).toBe("approval_required");
    if (pending.status !== "approval_required") {
      throw new Error("Expected verification approval to be required");
    }
    await service.approve({ ...input, commandSetHash: pending.commandSetHash });

    const reloaded = new VerificationCommandApprovalService(
      new FileVerificationCommandApprovalStore(userDataRoot),
    );
    await expect(reloaded.inspect(input)).resolves.toMatchObject({ status: "approved" });
    await expect(reloaded.inspect({
      ...input,
      commands: [{ command: "npm", args: ["run", "test:changed"], timeoutMs: 10_000 }],
    })).resolves.toMatchObject({ status: "approval_required" });
    await expect(reloaded.inspect({
      ...input,
      canonicalWorkspaceRoot: "/workspaces/copied-project-a",
    })).resolves.toMatchObject({ status: "approval_required" });
    await expect(reloaded.inspect({
      ...input,
      projectId: "project-b",
    })).resolves.toMatchObject({ status: "approval_required" });

    const stored = JSON.parse(readFileSync(
      join(userDataRoot, "verification-command-approvals.json"),
      "utf8",
    )) as { approvals: Record<string, unknown> };
    expect(Object.keys(stored.approvals)).toHaveLength(1);
  });
});
