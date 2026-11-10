import { describe, expect, it } from "vitest";

import { assessMaterialChangeImpact } from "./loop-material-rereview.js";

describe("TM-8 material change re-review", () => {
  it("requires scoped re-review without mechanical full rerun", () => {
    const previous = [
      {
        id: "m1",
        kind: "text" as const,
        purpose: "requirement" as const,
        title: "a",
        source: "paste" as const,
        parseStatus: "ok" as const,
        parseLevel: "text_preview" as const,
        textPreview: "old",
        bindingNodeIds: ["n1"],
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ];
    const next = [
      {
        ...previous[0]!,
        textPreview: "new",
        updatedAt: "2026-01-02T00:00:00.000Z",
      },
    ];
    const impact = assessMaterialChangeImpact({ previous, next });
    expect(impact.materialsChanged).toBe(true);
    expect(impact.requiresRereview).toBe(true);
    expect(impact.mechanicalFullRerun).toBe(false);
    expect(impact.affectedNodeIds).toEqual(["n1"]);
  });

  it("no-ops when fingerprints match", () => {
    const materials = [
      {
        id: "m1",
        kind: "text" as const,
        purpose: "requirement" as const,
        title: "a",
        source: "paste" as const,
        parseStatus: "ok" as const,
        textPreview: "same",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ];
    const impact = assessMaterialChangeImpact({
      previous: materials,
      next: materials,
    });
    expect(impact.requiresRereview).toBe(false);
    expect(impact.materialsChanged).toBe(false);
  });
});
