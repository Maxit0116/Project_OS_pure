import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

import { DebugInstrumentationService, instrumentationInsertionOffset, stripInstrumentation } from "./debug-instrumentation-service.js";

const TEAM = `import 'server-only'

const OPEN_TASK_STATUSES = ['todo', 'in_progress', 'done'] as const

export async function getTeamOverview() {
  return db.$transaction(async (transaction) => {
    const team = await transaction.team.findUnique({
      where: { id: session.activeTeamId },
      select: {
        memberships: {
          select: {
            user: {
              select: {
                _count: {
                  select: {
                    assignedTasks: {
                      where: {
                        archivedAt: null,
                        status: { in: [...OPEN_TASK_STATUSES] },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    })
    return team
  })
}
`;

function syntaxErrors(source: string, path = "lib/team.ts"): number {
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  return (file as unknown as { parseDiagnostics: unknown[] }).parseDiagnostics.length;
}

function project(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "dbg-inst-"));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content, "utf8");
  }
  return root;
}

const spec = (anchor: string, extra: Partial<{ id: string; filePath: string }> = {}) => ({
  id: extra.id ?? "inst_1",
  filePath: extra.filePath ?? "lib/team.ts",
  hypothesisId: "hyp_1",
  anchor,
  kind: "console_log" as const,
});

const apply = (root: string, specs: Array<ReturnType<typeof spec>>) =>
  new DebugInstrumentationService().apply({ workspaceRoot: root, sessionId: "dbg_1", debugLogPort: 4999, specs });

describe("placing a debug probe", () => {
  it("never puts it inside an expression: an anchor inside a nested query goes before the whole statement", () => {
    // Observed live: the probe landed inside a Prisma `where:` object literal, the anchor line lost its
    // indentation, and the file under test no longer compiled.
    const root = project({ "lib/team.ts": TEAM });
    const result = apply(root, [spec("status: { in: [...OPEN_TASK_STATUSES] },")]);
    const after = readFileSync(join(root, "lib/team.ts"), "utf8");

    expect(result.skipped).toEqual([]);
    expect(result.instrumentation).toHaveLength(1);
    expect(syntaxErrors(after)).toBe(0);
    // Placed before `const team = await ...`, with that line's indentation, original text intact.
    expect(after).toContain("    // __projectos_debug_start__\n    console.log('[projectos-debug]'");
    expect(after.indexOf("__projectos_debug_start__")).toBeLessThan(after.indexOf("const team = await transaction.team.findUnique({"));
    expect(after).toContain("                        status: { in: [...OPEN_TASK_STATUSES] },\n");
    expect(after.replace(/ *\/\/ __projectos_debug_start__[\s\S]*?\/\/ __projectos_debug_end__\n/gu, "")).toBe(TEAM);
  });

  it("puts a module-level probe before the declaration it names", () => {
    const root = project({ "lib/team.ts": TEAM });
    apply(root, [spec("const OPEN_TASK_STATUSES")]);
    const after = readFileSync(join(root, "lib/team.ts"), "utf8");
    expect(syntaxErrors(after)).toBe(0);
    expect(after.indexOf("__projectos_debug_start__")).toBeLessThan(after.indexOf("const OPEN_TASK_STATUSES = "));
    expect(after.indexOf("__projectos_debug_start__")).toBeGreaterThan(after.indexOf("import 'server-only'"));
  });

  it("keeps a 'use client' directive first", () => {
    const source = "'use client'\n\nexport function Widget() {\n  return 1\n}\n";
    const offset = instrumentationInsertionOffset(source, "'use client'", "components/Widget.tsx");
    expect(offset).toBe("'use client'".length);
  });

  it("drops a probe it cannot place safely, leaving the file untouched, and reports why", () => {
    const root = project({ "lib/team.ts": `// OPEN_TASK_STATUSES is documented here\n${TEAM}` });
    const result = apply(root, [spec("OPEN_TASK_STATUSES is documented here")]);
    expect(result.instrumentation).toEqual([]);
    expect(result.skipped[0]).toMatchObject({ id: "inst_1", reason: expect.stringMatching(/not inside a statement/u) });
    expect(readFileSync(join(root, "lib/team.ts"), "utf8")).toBe(`// OPEN_TASK_STATUSES is documented here\n${TEAM}`);
    expect(result.backupByFile.size).toBe(0);
  });

  it("applies the rest when one probe is dropped, and cleanup restores the original", () => {
    const root = project({ "lib/team.ts": TEAM });
    const service = new DebugInstrumentationService();
    const result = service.apply({
      workspaceRoot: root, sessionId: "dbg_1", debugLogPort: 4999,
      specs: [spec("no such anchor", { id: "inst_bad" }), spec("const OPEN_TASK_STATUSES", { id: "inst_ok" })],
    });
    expect(result.instrumentation.map((item) => item.id)).toEqual(["inst_ok"]);
    expect(result.skipped.map((item) => item.id)).toEqual(["inst_bad"]);
    service.cleanup(root, result.backupByFile, result.instrumentation);
    expect(readFileSync(join(root, "lib/team.ts"), "utf8")).toBe(TEAM);
  });

  it("puts several probes into one file without breaking it, and restores the true original", () => {
    const root = project({ "lib/team.ts": TEAM });
    const service = new DebugInstrumentationService();
    const result = service.apply({
      workspaceRoot: root, sessionId: "dbg_1", debugLogPort: 4999,
      specs: [spec("const OPEN_TASK_STATUSES", { id: "a" }), spec("status: { in: [...OPEN_TASK_STATUSES] },", { id: "b" })],
    });
    expect(syntaxErrors(readFileSync(join(root, "lib/team.ts"), "utf8"))).toBe(0);
    expect((readFileSync(join(root, "lib/team.ts"), "utf8").match(/__projectos_debug_start__/gu) ?? []).length).toBe(2);
    service.cleanup(root, result.backupByFile, result.instrumentation);
    expect(readFileSync(join(root, "lib/team.ts"), "utf8")).toBe(TEAM);
  });

  it("keeps a fix made after instrumentation when the probes are cleaned up", () => {
    // Observed live: "problem fixed - clean up instrumentation" restored the file as it was before the
    // probes went in, which was the buggy file. The fix was gone and the bug was back.
    const root = project({ "lib/team.ts": TEAM });
    const service = new DebugInstrumentationService();
    const result = service.apply({
      workspaceRoot: root, sessionId: "dbg_1", debugLogPort: 4999,
      specs: [spec("const OPEN_TASK_STATUSES", { id: "a" }), spec("status: { in: [...OPEN_TASK_STATUSES] },", { id: "b" })],
    });
    // The fix: the buggy constant loses 'done'. It lands in the instrumented file.
    const instrumented = readFileSync(join(root, "lib/team.ts"), "utf8");
    writeFileSync(join(root, "lib/team.ts"), instrumented.replace(", 'done'] as const", "] as const"), "utf8");

    service.cleanup(root, result.backupByFile, result.instrumentation);

    const cleaned = readFileSync(join(root, "lib/team.ts"), "utf8");
    expect(cleaned).not.toContain("__projectos_debug");
    expect(cleaned).toContain("const OPEN_TASK_STATUSES = ['todo', 'in_progress'] as const");
    expect(cleaned).toBe(TEAM.replace(", 'done'] as const", "] as const"));
    expect(syntaxErrors(cleaned)).toBe(0);
  });

  it("strips every probe block and nothing else, and does nothing to a file that has none", () => {
    const withBlocks = "a\n  // __projectos_debug_start__\n  console.log(1)\n  // __projectos_debug_end__\nb\n// __projectos_debug_start__\nx\n// __projectos_debug_end__\nc\n";
    expect(stripInstrumentation(withBlocks)).toBe("a\nb\nc\n");
    expect(stripInstrumentation("plain\ncode\n")).toBe("plain\ncode\n");
  });

  it("does not fail cleanup when an instrumented file has been removed since", () => {
    const root = project({ "lib/team.ts": TEAM });
    const service = new DebugInstrumentationService();
    const result = service.apply({
      workspaceRoot: root, sessionId: "dbg_1", debugLogPort: 4999,
      specs: [spec("const OPEN_TASK_STATUSES", { id: "a" })],
    });
    rmSync(join(root, "lib/team.ts"));
    expect(() => service.cleanup(root, result.backupByFile, result.instrumentation)).not.toThrow();
  });
});
