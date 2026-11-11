/**
 * Deterministic local_tools “model” response: read materials + sibling tests,
 * apply a real semantic fix (not a comment stamp). Attempt 1 leaves code still
 * failing; attempt 2+ applies the correct implementation so runtime can
 * experience fail → feedback → green.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

import type { LoopTaskMaterial } from "../contracts/loop-task-materials.js";

export type FixAttemptResult = {
  before: string;
  after: string;
  attempt: number;
  mode: "still_failing" | "fixed";
  expectedSnippet?: string;
};

function materialText(materials: LoopTaskMaterial[] | undefined): string {
  return (materials ?? [])
    .map((m) => {
      const selection =
        m.tablePreview != null
          ? `tablePreview=${JSON.stringify(m.tablePreview)}\n`
          : m.pdfPreview != null
            ? `pdfPreview=${JSON.stringify(m.pdfPreview)}\n`
            : "";
      return `${m.title}\nlevel=${m.parseLevel ?? m.parseStatus}\n${selection}${m.textPreview ?? ""}\n${m.parseMessage ?? ""}`;
    })
    .join("\n");
}

function findSiblingTest(workspaceRoot: string, filePath: string): string | null {
  const dir = dirname(filePath);
  const base = basename(filePath).replace(/\.js$/, "");
  for (const rel of [
    join(dir, `${base}.test.js`),
    join(dir, `${base}.spec.js`),
  ]) {
    if (existsSync(join(workspaceRoot, rel))) return rel;
  }
  return null;
}

/** Infer expected return / behavior from test + materials + goal. */
export function inferExpectedReturn(input: {
  testSource: string;
  materialsText: string;
  goal: string;
}): string | null {
  const eq = /(?:===|!==|==|!=)\s*['"]([^'"]+)['"]/.exec(input.testSource);
  if (eq?.[1]) return eq[1];
  const blob = `${input.testSource}\n${input.materialsText}\n${input.goal}`;
  if (/Hello,\s*\$\{name\}!|Hello,\s*world!/i.test(blob)) return "Hello, ${name}!";
  if (/must return\s+['"]?ok['"]?/i.test(blob)) return "ok";
  return null;
}

/**
 * @param attempt 1-based implement attempt for this leaf.
 * attempt===1 → still-failing code; attempt>=2 → correct fix from materials/tests.
 */
export function applyRequirementFix(input: {
  workspaceRoot: string;
  filePath: string;
  goal: string;
  attempt: number;
  materials?: LoopTaskMaterial[];
}): FixAttemptResult {
  const abs = join(input.workspaceRoot, input.filePath);
  const before = existsSync(abs) ? readFileSync(abs, "utf8") : "";
  const testRel = findSiblingTest(input.workspaceRoot, input.filePath);
  const testSource = testRel
    ? readFileSync(join(input.workspaceRoot, testRel), "utf8")
    : "";
  const materialsText = materialText(input.materials);
  const expected = inferExpectedReturn({
    testSource,
    materialsText,
    goal: input.goal,
  });
  const isGreet =
    /\bgreet\b/.test(`${input.filePath}\n${testSource}\n${input.goal}`) ||
    input.filePath.endsWith("greet.js");

  let after: string;
  let mode: FixAttemptResult["mode"];

  if (input.attempt <= 1) {
    // Still-failing so Test node can fail inside the run (not pre-green).
    after = isGreet
      ? "export function greet(name) {\n  return 'hi ' + name;\n}\n"
      : "export function hello() {\n  return 'broken';\n}\n";
    mode = "still_failing";
  } else if (isGreet) {
    after = "export function greet(name) {\n  return `Hello, ${name}!`;\n}\n";
    mode = "fixed";
  } else {
    const target = expected && expected !== "Hello, ${name}!" ? expected : "ok";
    after = `export function hello() {\n  return ${JSON.stringify(target)};\n}\n`;
    mode = "fixed";
  }

  writeFileSync(abs, after, "utf8");
  return {
    before,
    after,
    attempt: input.attempt,
    mode,
    ...(expected ? { expectedSnippet: expected } : {}),
  };
}
