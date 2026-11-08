import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import {
  collectFeaturesIntegrityIssues,
  FeaturesFileSchema,
  parseFeaturesFile,
} from "./features.js";
import {
  confirmFirstPrinciplesThesis,
  createFirstPrinciplesSession,
  answerFirstPrinciplesTurn,
} from "../services/first-principles/session-ops.js";
import { writePlannedFeatureFromThesis } from "../services/first-principles/features-write.js";

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
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

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

  it("rejects unrecognized feature keys while remaining .strict()", () => {
    const base = FeaturesFileSchema.parse(
      JSON.parse(readFileSync(fixtureFeatures, "utf8")) as unknown,
    );
    expect(() => FeaturesFileSchema.parse({
      ...base,
      features: [{
        ...base.features[0]!,
        inventThisField: "nope",
      }],
    })).toThrow(/Unrecognized key/u);
  });

  it("parses the on-disk document produced by writePlannedFeatureFromThesis", () => {
    const root = mkdtempSync(join(tmpdir(), "fp-feat-schema-"));
    dirs.push(root);
    let session = createFirstPrinciplesSession({
      projectId: "p1",
      vision: "订阅提醒",
    });
    for (const optionId of [
      "l0_user_pain",
      "l1_save_time",
      "l2_pass",
      "l3_single_happy",
      "l4_skip_diagram",
    ]) {
      session = answerFirstPrinciplesTurn(session, {
        questionId: session.activeQuestion!.id,
        kind: "option",
        selectedOptionId: optionId,
      });
    }
    session = confirmFirstPrinciplesThesis(session, {
      ...session.thesis!,
      verdict: "go",
      confidence: 4,
    });

    const write = writePlannedFeatureFromThesis(root, session);
    expect(write.written).toBe(true);
    expect(write.featureId).toBeTruthy();

    const path = join(root, ".projectos", "features.json");
    const raw = JSON.parse(readFileSync(path, "utf8")) as {
      features: Array<Record<string, unknown>>;
    };
    const written = raw.features.find((feature) => feature.id === write.featureId);
    expect(written).toMatchObject({
      status: "planned",
      locked: false,
      mvp: expect.any(String),
      successSignal: expect.any(String),
      nonGoals: expect.any(Array),
    });
    expect(String(written?.mvp ?? "").length).toBeGreaterThan(0);
    expect(String(written?.successSignal ?? "").length).toBeGreaterThan(0);
    expect(Array.isArray(written?.nonGoals) && written.nonGoals.length).toBeGreaterThan(0);

    const parsed = parseFeaturesFile(raw);
    const feature = parsed.features.find((entry) => entry.id === write.featureId);
    expect(feature).toMatchObject({
      status: "planned",
      locked: false,
      mvp: written?.mvp,
      successSignal: written?.successSignal,
      nonGoals: written?.nonGoals,
    });
  });
});
