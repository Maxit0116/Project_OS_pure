import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import type { LoadedProjectOSWorkspace } from "../persistence/workspace-store.js";
import {
  exploreForAskQuestion,
  resolveExplorationAllowList,
} from "./ask-exploration-service.js";

function workspaceWithIndex(paths: string[]): LoadedProjectOSWorkspace {
  const root = mkdtempSync(join(tmpdir(), "ask-explore-"));
  for (const path of paths) {
    const absolute = join(root, path);
    mkdirSync(join(absolute, ".."), { recursive: true });
    writeFileSync(absolute, `export function AuthService() {\n  return true\n}\n`, "utf8");
  }
  return {
    workspaceRoot: root,
    graph: {
      fileIndex: paths.map((path) => ({ path, nodeIds: ["n1"] })),
    },
  } as unknown as LoadedProjectOSWorkspace;
}

describe("exploreForAskQuestion", () => {
  it("greps indexed paths only and returns a read-only trace", () => {
    const workspace = workspaceWithIndex(["src/auth.ts", "src/other.ts"]);
    writeFileSync(join(workspace.workspaceRoot, "secret.ts"), "AuthService leak", "utf8");

    const result = exploreForAskQuestion(workspace, "Where is AuthService defined?");

    expect(result.trace.queriedSymbols).toContain("AuthService");
    expect(result.trace.readPaths.every((path) => path.startsWith("src/"))).toBe(true);
    expect(result.trace.readPaths).not.toContain("secret.ts");
    expect(result.supplementalMarkdown).toContain("Ask exploration (read-only)");
    expect(result.trace.hits.length).toBeGreaterThan(0);
    expect(result.trace.reads[0]?.path).toMatch(/^src\//);
    expect(result.trace.reads[0]?.excerpt).toContain("AuthService");
    expect(result.trace.reads[0]?.startLine).toBeGreaterThan(0);
  });

  it("respects allowedReadPaths ACL (node/file scope)", () => {
    const workspace = workspaceWithIndex(["src/auth.ts", "src/other.ts"]);
    const result = exploreForAskQuestion(workspace, "Where is AuthService defined?", {
      allowedReadPaths: ["src/auth.ts"],
    });

    expect(result.trace.hits.every((hit) => hit.path === "src/auth.ts")).toBe(true);
    expect(result.trace.readPaths).toEqual(["src/auth.ts"]);
    expect(result.trace.readPaths).not.toContain("src/other.ts");
  });

  it("denies reads outside the allow list even if indexed", () => {
    const workspace = workspaceWithIndex(["src/auth.ts", "src/other.ts"]);
    const result = exploreForAskQuestion(workspace, "Where is AuthService defined?", {
      allowedReadPaths: ["src/other.ts"],
    });
    // AuthService lives in auth.ts which is not allowed → no hits / reads of auth.
    expect(result.trace.readPaths).not.toContain("src/auth.ts");
    expect(
      result.trace.hits.every((hit) => hit.path === "src/other.ts"),
    ).toBe(true);
  });

  it("truncates when maxHits / maxReads are reached", () => {
    const workspace = workspaceWithIndex(["a.ts", "b.ts", "c.ts"]);
    const result = exploreForAskQuestion(workspace, "Find AuthService please", {
      maxHits: 1,
      maxReads: 1,
    });
    expect(result.trace.hits.length).toBeLessThanOrEqual(1);
    expect(result.trace.readPaths.length).toBeLessThanOrEqual(1);
    expect(result.trace.truncated).toBe(true);
  });

  it("runs bounded multi-pass rounds mining symbols from hit previews", () => {
    const workspace = workspaceWithIndex(["src/auth.ts"]);
    writeFileSync(
      join(workspace.workspaceRoot, "src/auth.ts"),
      [
        "export function AuthService() {",
        "  return TokenValidator()",
        "}",
        "export function TokenValidator() { return true }",
        "",
      ].join("\n"),
      "utf8",
    );
    const result = exploreForAskQuestion(workspace, "Where is AuthService?", {
      maxRounds: 2,
      maxHits: 8,
      maxReads: 2,
    });
    expect(result.trace.queriedSymbols).toContain("AuthService");
    expect(result.trace.maxRounds).toBe(2);
    expect(result.trace.roundsUsed).toBeGreaterThanOrEqual(1);
    expect(result.trace.rounds.length).toBe(result.trace.roundsUsed);
    expect(result.trace.rounds[0]?.symbols).toContain("AuthService");
    expect(result.supplementalMarkdown).toMatch(/Rounds used: \d+\/2/);
    expect(result.trace.hits.length).toBeGreaterThan(0);
  });

  it("resolveExplorationAllowList intersects index with allowedReadPaths", () => {
    const workspace = workspaceWithIndex(["a.ts", "b.ts"]);
    expect(resolveExplorationAllowList(workspace, [])).toEqual(["a.ts", "b.ts"]);
    expect(resolveExplorationAllowList(workspace, ["a.ts", "missing.ts"])).toEqual([
      "a.ts",
    ]);
  });
});
