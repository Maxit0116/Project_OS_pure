import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";

import { ProjectGraphSchema } from "../contracts/graph.js";
import { ensureWorkspaceBootstrapped } from "./workspace-bootstrap.js";

describe("ensureWorkspaceBootstrapped", () => {
  it("creates core .projectos fixtures for an empty directory", () => {
    const root = mkdtempSync(join(tmpdir(), "projectos-bootstrap-"));
    try {
      const result = ensureWorkspaceBootstrapped(root);
      expect(result.bootstrapped).toBe(true);
      expect(
        ProjectGraphSchema.parse(
          JSON.parse(readFileSync(join(root, ".projectos", "graph.json"), "utf8")),
        ).nodes.length,
      ).toBeGreaterThan(0);
      expect(existsSync(join(root, ".projectos", "prompts", "structure-scan.md"))).toBe(
        true,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("repairs invalid graph.json with a heuristic rewrite", () => {
    const root = mkdtempSync(join(tmpdir(), "projectos-bootstrap-repair-"));
    try {
      mkdirSync(join(root, ".projectos"), { recursive: true });
      writeFileSync(join(root, ".projectos", "project.json"), "{}");
      writeFileSync(join(root, ".projectos", "graph.json"), "{ invalid");
      const result = ensureWorkspaceBootstrapped(root);
      expect(result.bootstrapped).toBe(true);
      expect(
        ProjectGraphSchema.safeParse(
          JSON.parse(readFileSync(join(root, ".projectos", "graph.json"), "utf8")),
        ).success,
      ).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
