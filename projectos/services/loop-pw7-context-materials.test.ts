import { describe, expect, it } from "vitest";

import { buildPw7ContextMaterial } from "./loop-pw7-context-materials.js";

describe("PW-7 context → materials", () => {
  it("maps issue/PR/code/error into task materials without touching Intent", () => {
    const issue = buildPw7ContextMaterial({
      kind: "issue",
      title: "Bug: greet",
      body: "fails on world",
      ref: "acme/app#12",
      bindingNodeIds: ["n_impl"],
    });
    expect(issue.purpose).toBe("issue_or_pr");
    expect(issue.runOverride).toBe(true);
    expect(issue.bindingNodeIds).toEqual(["n_impl"]);
    expect(issue.textPreview).toMatch(/fails/);

    const code = buildPw7ContextMaterial({
      kind: "code_selection",
      title: "src/greet.js",
      ref: "src/greet.js#L1-L20",
      body: "export function greet",
    });
    expect(code.kind).toBe("project_ref");
    expect(code.projectRef?.path).toMatch(/greet/);
  });
});
