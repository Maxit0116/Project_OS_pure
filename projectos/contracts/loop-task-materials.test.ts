import { describe, expect, it } from "vitest";
import {
  LoopRunBindingSchema,
  LoopTaskMaterialSchema,
} from "./loop-task-materials.js";

describe("loop-task-materials contracts", () => {
  it("parses a project_ref material without mutating definition fields", () => {
    const material = LoopTaskMaterialSchema.parse({
      id: "mat_1",
      kind: "project_ref",
      purpose: "code_context",
      title: "Login service",
      source: "project_ref",
      parseStatus: "ok",
      projectRef: { path: "src/auth/login.ts", kind: "file" },
      createdAt: new Date().toISOString(),
      runOverride: true,
    });
    expect(material.runOverride).toBe(true);
    expect(material.projectRef?.path).toContain("login.ts");
  });

  it("binds run snapshot with specVersion lock", () => {
    const binding = LoopRunBindingSchema.parse({
      projectId: "proj_1",
      branch: "main",
      specVersion: "spec_1",
      materials: [],
      createdAt: new Date().toISOString(),
    });
    expect(binding.specVersion).toBe("spec_1");
  });

  it("accepts Gmail provenance materials for run snapshots", () => {
    const material = LoopTaskMaterialSchema.parse({
      id: "mat_gmail_1",
      kind: "file",
      purpose: "log",
      title: "stack.pdf",
      source: "gmail",
      parseStatus: "pending",
      gmail: {
        accountRefId: "cred_gmail_ro",
        messageId: "m1",
        threadId: "t1",
        attachmentId: "att_1",
      },
      runOverride: true,
      createdAt: new Date().toISOString(),
    });
    expect(material.gmail?.messageId).toBe("m1");
  });
});
