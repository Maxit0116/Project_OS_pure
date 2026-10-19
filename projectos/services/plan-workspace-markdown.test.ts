import { describe, expect, it } from "vitest";

import type { ImplementationPlan } from "../contracts/implementation-plan.js";
import {
  parsePlanMarkdown,
  serializePlanMarkdown,
} from "./plan-workspace-markdown.js";

const samplePlan: ImplementationPlan = {
  version: "0.1.0",
  id: "plan_roundtrip",
  projectId: "proj_1",
  scope: { kind: "global" },
  objective: "Improve auth flow",
  steps: [
    {
      id: "step_1",
      description: "Update login page",
      affectedFiles: ["app/login/page.tsx"],
      acceptanceCriteria: ["Login works"],
    },
  ],
  todos: [
    { id: "todo_1", content: "Add tests", status: "pending" },
    { id: "todo_2", content: "Ship", status: "done" },
  ],
  ambiguities: [],
  rationale: "Because auth is brittle",
  status: "ready",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
};

describe("plan-workspace-markdown", () => {
  it("round-trips serialize → parse", () => {
    const markdown = serializePlanMarkdown(samplePlan);
    const restored = parsePlanMarkdown(markdown, {
      projectId: "proj_1",
      planId: "plan_roundtrip",
    });
    expect(restored.id).toBe(samplePlan.id);
    expect(restored.objective).toBe(samplePlan.objective);
    expect(restored.steps[0]?.description).toBe("Update login page");
    expect(restored.steps[0]?.affectedFiles).toEqual(["app/login/page.tsx"]);
    expect(restored.todos).toHaveLength(2);
    expect(restored.todos[1]?.status).toBe("done");
    expect(restored.rationale).toContain("brittle");
    expect(restored.scope).toEqual({ kind: "global" });
  });

  it("parses legacy markdown without frontmatter", () => {
    const legacy = [
      "# Legacy objective",
      "",
      "## Steps",
      "1. Do the thing",
      "   - Files: a.ts",
      "",
      "## Todos",
      "- [ ] first",
      "",
      "## Rationale",
      "Why not",
      "",
    ].join("\n");
    const restored = parsePlanMarkdown(legacy, {
      projectId: "proj_legacy",
      planId: "plan_legacy",
    });
    expect(restored.objective).toBe("Legacy objective");
    expect(restored.steps[0]?.affectedFiles).toEqual(["a.ts"]);
    expect(restored.status).toBe("ready");
    expect(restored.projectId).toBe("proj_legacy");
  });
});
