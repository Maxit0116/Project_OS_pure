import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { buildHarnessInstructions } from "./instructions.js";
import { loadProjectRulesMarkdown } from "./rules.js";

describe("buildHarnessInstructions (H2.C)", () => {
  it("assembles base, mode note, rules, and skills in order", () => {
    const text = buildHarnessInstructions({
      baseSystemPrompt: "You are the change agent.",
      mode: "change",
      rulesMarkdown: "Always run typecheck after edits.",
      skillBodies: [{ name: "review-change", body: "Prefer small diffs." }],
    });
    expect(text).toContain("You are the change agent.");
    expect(text).toContain("scoped edits only");
    expect(text).toContain("## Project Rules");
    expect(text).toContain("Always run typecheck after edits.");
    expect(text).toContain("## Active Skills");
    expect(text).toContain("Prefer small diffs.");
  });

  it("marks Ask as read-only", () => {
    const text = buildHarnessInstructions({
      baseSystemPrompt: "",
      mode: "ask",
    });
    expect(text).toContain("read-only");
  });
});

describe("loadProjectRulesMarkdown", () => {
  it("loads markdown files under .projectos/rules", () => {
    const root = mkdtempSync(join(tmpdir(), "pos-rules-"));
    const rulesDir = join(root, ".projectos", "rules");
    mkdirSync(rulesDir, { recursive: true });
    writeFileSync(join(rulesDir, "workflow.md"), "Use pnpm test.", "utf8");
    expect(loadProjectRulesMarkdown(root)).toContain("Use pnpm test.");
  });

  it("returns empty string when rules directory is missing", () => {
    const root = mkdtempSync(join(tmpdir(), "pos-norules-"));
    expect(loadProjectRulesMarkdown(root)).toBe("");
  });
});
