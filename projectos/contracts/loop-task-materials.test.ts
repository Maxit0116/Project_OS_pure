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
});
