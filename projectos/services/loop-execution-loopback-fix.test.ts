import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { applyRequirementFix, inferExpectedReturn } from "./loop-execution-loopback-fix.js";

describe("loop-execution-loopback-fix", () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("infers expected return from sibling test equality", () => {
    expect(
      inferExpectedReturn({
        testSource: "if (hello() !== 'ok') throw new Error('x');",
        materialsText: "",
        goal: "",
      }),
    ).toBe("ok");
  });

  it("attempt1 leaves greet still failing; attempt2 applies Hello, name!", () => {
    const root = mkdtempSync(join(tmpdir(), "loop-fix-"));
    roots.push(root);
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(
      join(root, "src", "greet.js"),
      "export function greet(name) { return 'broken'; }\n",
    );
    writeFileSync(
      join(root, "src", "greet.test.js"),
      "import { greet } from './greet.js';\n" +
        "if (greet('world') !== 'Hello, world!') throw new Error('fail');\n",
    );

    const a1 = applyRequirementFix({
      workspaceRoot: root,
      filePath: "src/greet.js",
      goal: "Implement greet(name) → Hello, ${name}!",
      attempt: 1,
      materials: [
        {
          id: "m1",
          kind: "text",
          purpose: "requirement",
          title: "req",
          source: "composer_text",
          parseStatus: "ok",
          textPreview: "greet must return Hello, ${name}!",
          version: 1,
          runOverride: true,
          createdAt: "2026-11-10T00:00:00.000Z",
          updatedAt: "2026-11-10T00:00:00.000Z",
        },
      ],
    });
    expect(a1.mode).toBe("still_failing");
    expect(readFileSync(join(root, "src/greet.js"), "utf8")).toMatch(/hi /);
    expect(readFileSync(join(root, "src/greet.js"), "utf8")).not.toMatch(
      /Hello, \$\{name\}!/,
    );

    const a2 = applyRequirementFix({
      workspaceRoot: root,
      filePath: "src/greet.js",
      goal: "Implement greet(name) → Hello, ${name}!",
      attempt: 2,
    });
    expect(a2.mode).toBe("fixed");
    expect(readFileSync(join(root, "src/greet.js"), "utf8")).toContain(
      "Hello, ${name}!",
    );
    // Not a comment-only stamp on already-correct code.
    expect(a2.after).not.toMatch(/loopback·local_tools/);
  });
});
