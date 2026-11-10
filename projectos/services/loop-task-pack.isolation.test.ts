/**
 * taskPack staging persists materials without mutating Intent draft / Spec.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  createLoopGraph,
  getLoopGraph,
  upsertLoopGraph,
} from "./loop-graph-service.js";

describe("loop taskPack isolation", () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("upserts taskPack materials while draft revision/prompt stay identical", () => {
    const root = mkdtempSync(join(tmpdir(), "loop-taskpack-"));
    roots.push(root);
    let doc = createLoopGraph(root, "proj", "Task pack isolation");
    const draftBefore = structuredClone(doc.draft);
    const now = new Date().toISOString();
    doc = upsertLoopGraph(root, {
      ...doc,
      taskPack: {
        branch: "feat/materials",
        materials: [
          {
            id: "mat_1",
            kind: "text",
            purpose: "requirement",
            title: "req",
            source: "composer_text",
            parseStatus: "ok",
            parseLevel: "text_preview",
            textPreview: "Ship greet",
            version: 1,
            runOverride: true,
            createdAt: now,
            updatedAt: now,
          },
        ],
        updatedAt: now,
      },
    });
    expect(doc.draft).toEqual(draftBefore);
    expect(doc.taskPack?.materials?.[0]?.parseLevel).toBe("text_preview");
    const reopened = getLoopGraph(root, doc.id)!;
    expect(reopened.draft).toEqual(draftBefore);
    expect(reopened.taskPack?.branch).toBe("feat/materials");
    expect(reopened.taskPack?.materials).toHaveLength(1);
  });
});
