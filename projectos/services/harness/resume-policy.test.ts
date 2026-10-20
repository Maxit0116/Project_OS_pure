import { describe, expect, it } from "vitest";

import { decideHarnessResume } from "./resume-policy.js";

describe("harness resume (H6)", () => {
  it("regenerates an interrupted run that never applied", () => {
    expect(decideHarnessResume({ status: "interrupted", hasBackup: false })).toEqual({
      action: "regenerate",
    });
  });

  it("refuses another apply when a backup already exists", () => {
    expect(decideHarnessResume({
      status: "interrupted",
      hasBackup: true,
      backupId: "backup-1",
    })).toEqual({ action: "verify_or_undo", backupId: "backup-1" });
  });

  it("does not treat cancellation as an interrupt", () => {
    expect(decideHarnessResume({ status: "cancelled", hasBackup: false }).action).toBe(
      "reject",
    );
  });
});
