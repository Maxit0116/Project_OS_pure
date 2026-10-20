import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { buildHarnessInstructions } from "./instructions.js";
import { loadWalkedInstructions } from "./walk-instructions.js";

describe("loadWalkedInstructions", () => {
  it("places the nearer AGENTS.md after the root file and skips other directories", () => {
    const root = mkdtempSync(join(tmpdir(), "pos-walk-"));
    mkdirSync(join(root, "src"), { recursive: true });
    mkdirSync(join(root, "other"), { recursive: true });
    writeFileSync(join(root, "AGENTS.md"), "ROOT_SENTINEL", "utf8");
    writeFileSync(join(root, "src", "AGENTS.md"), "NEAR_SENTINEL", "utf8");
    writeFileSync(join(root, "other", "AGENTS.md"), "OTHER_SENTINEL", "utf8");

    const walked = loadWalkedInstructions(root, "src/app.ts");
    expect(walked.markdown.indexOf("NEAR_SENTINEL")).toBeGreaterThan(walked.markdown.indexOf("ROOT_SENTINEL"));
    expect(walked.markdown).not.toContain("OTHER_SENTINEL");
    expect(walked.markdown).toContain("Project Rules");
    const instructions = buildHarnessInstructions({
      baseSystemPrompt: "",
      mode: "ask",
      rulesMarkdown: "Always use the graph.",
      walkMarkdown: walked.markdown,
    });
    expect(instructions.indexOf("## Walked instructions")).toBeGreaterThan(instructions.indexOf("## Project Rules"));
    expect(instructions.indexOf("ROOT_SENTINEL")).toBeGreaterThan(instructions.indexOf("Always use the graph."));

    const rootOnly = loadWalkedInstructions(root, undefined);
    expect(rootOnly.markdown).toContain("ROOT_SENTINEL");
    expect(rootOnly.markdown).not.toContain("NEAR_SENTINEL");
  });

  it("omits a walked file that looks like a secret and skips a body already in project rules", () => {
    const root = mkdtempSync(join(tmpdir(), "pos-walk-secret-"));
    writeFileSync(join(root, "AGENTS.md"), "sk-abcdefghijklmnopqrstuvwxyz", "utf8");
    writeFileSync(join(root, "CLAUDE.md"), "Same body.", "utf8");
    const walked = loadWalkedInstructions(root, undefined, {
      rules: { markdown: "### workflow.md\n\nSame body.", omissions: [] },
    });
    expect(walked.markdown).not.toContain("sk-");
    expect(walked.markdown).not.toContain("Same body.");
    expect(walked.omissions).toEqual([{ reason: "walk_secret", count: 1 }]);
  });
});
