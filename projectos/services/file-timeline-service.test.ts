import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  listFileTimeline,
  saveFileWithHistory,
} from "./file-timeline-service.js";

describe("file-timeline-service", () => {
  it("writes manual save snapshots and indexes timeline entries", () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "projectos-timeline-"));
    const filePath = "src/example.ts";
    const fullPath = join(workspaceRoot, filePath);
    mkdirSync(join(workspaceRoot, "src"), { recursive: true });
    writeFileSync(fullPath, "const before = 1;\n", "utf8");

    const result = saveFileWithHistory(workspaceRoot, filePath, "const after = 2;\n");
    expect(result.created).toBe(false);
    expect(readFileSync(fullPath, "utf8")).toBe("const after = 2;\n");

    const entries = listFileTimeline(workspaceRoot, filePath);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      kind: "manual_save",
      filePath,
      label: "Manual save",
    });

    const index = JSON.parse(
      readFileSync(join(workspaceRoot, ".projectos", "file-timeline.json"), "utf8"),
    );
    expect(index.entries).toHaveLength(1);

    rmSync(workspaceRoot, { recursive: true, force: true });
  });
});
