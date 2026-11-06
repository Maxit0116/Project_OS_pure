import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  collectFeaturesIntegrityIssues,
  FeaturesFileSchema,
  parseFeaturesFile,
} from "./features.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixtureFeatures = join(
  here,
  "..",
  "client",
  "sample-projectos-fixtures",
  "features.json",
);
const sampleFeatures = join(
  here,
  "..",
  "..",
  "sample-graph-saas",
  ".projectos",
  "features.json",
);

describe("features.json story-map contract", () => {
  it("parses the curated sample and fixture copies with unique cross-refs", () => {
    for (const path of [sampleFeatures, fixtureFeatures]) {
      const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
      const parsed = parseFeaturesFile(raw);
      expect(parsed.version).toMatch(/^\d+\.\d+\.\d+/u);
      expect(parsed.epics.length).toBeGreaterThan(0);
      expect(parsed.features.length).toBeGreaterThan(0);
      expect(collectFeaturesIntegrityIssues(parsed)).toEqual([]);
      expect(new Set(parsed.epics.map((epic) => epic.id)).size).toBe(parsed.epics.length);
      expect(new Set(parsed.features.map((feature) => feature.id)).size)
        .toBe(parsed.features.length);
    }
  });

  it("rejects an unknown epicId and duplicate feature ids", () => {
    const base = FeaturesFileSchema.parse(
      JSON.parse(readFileSync(fixtureFeatures, "utf8")) as unknown,
    );
    expect(() => parseFeaturesFile({
      ...base,
      features: [
        ...base.features,
        {
          ...base.features[0]!,
          id: "f_duplicate_probe",
          epicId: "epic_does_not_exist",
          steps: [],
        },
      ],
    })).toThrow(/Unknown epicId/u);

    expect(() => parseFeaturesFile({
      ...base,
      features: [base.features[0]!, { ...base.features[0]! }],
    })).toThrow(/Duplicate feature id/u);
  });

  it("accepts a planned feature shape used by first-principles writes", () => {
    const parsed = parseFeaturesFile({
      version: "0.1.0",
      manifest: { generator: "projectos@first-principles" },
      epics: [{ id: "epic_access", name: "Access" }],
      features: [{
        id: "f_new_capability",
        name: "New capability",
        summary: "Planned from a go thesis",
        epicId: "epic_access",
        status: "planned",
        locked: false,
        steps: [],
      }],
    });
    expect(parsed.features[0]).toMatchObject({
      status: "planned",
      locked: false,
    });
  });
});
