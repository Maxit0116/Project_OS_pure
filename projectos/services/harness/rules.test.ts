import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { loadProjectRules, loadProjectRulesMarkdown } from "./rules.js";

function rulesRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "pos-rule-activation-"));
  mkdirSync(join(root, ".projectos", "rules"), { recursive: true });
  return root;
}

describe("loadProjectRules", () => {
  it("keeps files without frontmatter always-on", () => {
    const root = rulesRoot();
    writeFileSync(join(root, ".projectos", "rules", "workflow.md"), "Use pnpm test.", "utf8");
    expect(loadProjectRulesMarkdown(root)).toContain("Use pnpm test.");
  });

  it("hides glob rule bodies until a bundle or pin path matches", () => {
    const root = rulesRoot();
    writeFileSync(
      join(root, ".projectos", "rules", "billing.md"),
      ["---", "activation: globs", 'globs: ["src/billing/**"]', "description: Billing totals", "---", "Round half away from zero."].join("\n"),
      "utf8",
    );
    const idle = loadProjectRules(root, { activePaths: ["src/auth/login.ts"] });
    expect(idle.markdown).not.toContain("Round half away from zero.");
    expect(idle.markdown).toContain("Billing totals");
    const active = loadProjectRules(root, { activePaths: ["src/billing/invoice.ts"] });
    expect(active.markdown).toContain("Round half away from zero.");
  });

  it("injects a manual rule only when that rule is pinned", () => {
    const root = rulesRoot();
    writeFileSync(
      join(root, ".projectos", "rules", "review.md"),
      ["---", "activation: manual", "description: Review checklist", "---", "Read the diff twice."].join("\n"),
      "utf8",
    );
    expect(loadProjectRules(root).markdown).not.toContain("Read the diff twice.");
    const pinned = loadProjectRules(root, { manualRulePaths: ["review.md"] });
    expect(pinned.markdown).toContain("Read the diff twice.");
  });

  it("treats an unknown activation as always-on and records the frontmatter omission", () => {
    const root = rulesRoot();
    writeFileSync(
      join(root, ".projectos", "rules", "broken.md"),
      ["---", "activation: sometimes", "---", "Still apply this."].join("\n"),
      "utf8",
    );
    const loaded = loadProjectRules(root);
    expect(loaded.markdown).toContain("Still apply this.");
    expect(loaded.omissions).toEqual([{ reason: "rules_frontmatter", count: 1 }]);
  });

  it("drops later chunks when the character budget is exceeded", () => {
    const root = rulesRoot();
    writeFileSync(join(root, ".projectos", "rules", "a.md"), "always rule body", "utf8");
    writeFileSync(
      join(root, ".projectos", "rules", "z.md"),
      ["---", "activation: manual", "description: later", "---", "manual body that should drop first"].join("\n"),
      "utf8",
    );
    const loaded = loadProjectRules(root, { manualRulePaths: ["z.md"], maxChars: 40 });
    expect(loaded.markdown).toContain("always rule body");
    expect(loaded.markdown).not.toContain("manual body");
    expect(loaded.omissions.some((item) => item.reason === "rules_budget")).toBe(true);
  });
});
