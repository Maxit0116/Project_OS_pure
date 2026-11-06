import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { SELECTED_FILE_MAX_ESTIMATED_TOKENS } from "../local-context-assembler.js";
import { editableCandidates, oversizeFileTokens, oversizeNote } from "./oversize-files.js";

function repo(files: Record<string, number>): string {
  const root = mkdtempSync(join(tmpdir(), "oversize-"));
  for (const [path, chars] of Object.entries(files)) {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), "x".repeat(chars));
  }
  return root;
}

const LIMIT_CHARS = SELECTED_FILE_MAX_ESTIMATED_TOKENS * 4;

describe("files too large for an edit", () => {
  it("measures only what is over the limit, by the same estimate the context assembler uses", () => {
    const root = repo({ "small.ts": 1_000, "edge.ts": LIMIT_CHARS, "big.ts": LIMIT_CHARS + 4 });
    expect(oversizeFileTokens(root, "small.ts")).toBeUndefined();
    expect(oversizeFileTokens(root, "edge.ts")).toBeUndefined();
    expect(oversizeFileTokens(root, "big.ts")).toBe(SELECTED_FILE_MAX_ESTIMATED_TOKENS + 1);
    expect(oversizeFileTokens(root, "missing.ts")).toBeUndefined();
  });

  it("counts characters, not bytes: a file of multi-byte text that fits is not refused", () => {
    const root = mkdtempSync(join(tmpdir(), "oversize-cjk-"));
    writeFileSync(join(root, "zh.md"), "文".repeat(LIMIT_CHARS));
    expect(oversizeFileTokens(root, "zh.md")).toBeUndefined();
  });

  it("splits a planner's candidates into editable files and the ones left out", () => {
    // excalidraw: App.tsx is about 93,000 tokens and was planned as one of two tasks.
    const root = repo({ "src/ZoomActions.tsx": 2_000, "src/App.tsx": LIMIT_CHARS * 8, "src/util.ts": 500 });
    const { editable, tooLarge } = editableCandidates(root, ["src/App.tsx", "src/ZoomActions.tsx", "src/util.ts"]);
    expect(editable).toEqual(["src/ZoomActions.tsx", "src/util.ts"]);
    expect(tooLarge).toEqual([{ path: "src/App.tsx", estimatedTokens: SELECTED_FILE_MAX_ESTIMATED_TOKENS * 8 }]);
  });

  it("fails with the message the person already understands when nothing editable is left", () => {
    const root = repo({ "a.py": LIMIT_CHARS * 3 });
    expect(() => editableCandidates(root, ["a.py"])).toThrowError(
      /Selected file 'a\.py' cannot be used for local context: selected_file_too_large \(about 36000 tokens; the limit is 12000\)/u,
    );
    expect(() => editableCandidates(root, [])).not.toThrow();
  });

  it("tells the planner which files were left out and why, or says nothing", () => {
    expect(oversizeNote(undefined)).toBe("");
    expect(oversizeNote([])).toBe("");
    const note = oversizeNote([{ path: "src/App.tsx", estimatedTokens: 93_000 }]);
    expect(note).toContain("src/App.tsx (about 93000 tokens)");
    expect(note).toContain("too large to be edited");
  });
});
