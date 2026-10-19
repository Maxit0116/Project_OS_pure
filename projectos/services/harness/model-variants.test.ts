import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import type { ModelProfile } from "../../contracts/settings.js";
import {
  loadModelHarnessDocument,
  modelHarnessSystemDelta,
  resolveModelHarnessVariant,
} from "./model-variants.js";

const profile = (overrides: Partial<ModelProfile> = {}): ModelProfile => ({
  id: "model-a",
  name: "A",
  provider: "custom",
  model: "claude-sonnet-4",
  apiKeyRef: "k",
  ...overrides,
});

describe("model harness variants (H4.B)", () => {
  it("resolves by modelProfileId first", () => {
    const doc = {
      version: "0.1.0" as const,
      variants: [
        {
          match: { modelProfileId: "model-a" },
          systemDelta: "Prefer dedicated search tools.",
        },
        {
          match: { provider: "custom" },
          systemDelta: "Generic custom provider.",
        },
      ],
    };
    expect(resolveModelHarnessVariant(profile(), doc)?.systemDelta).toBe(
      "Prefer dedicated search tools.",
    );
  });

  it("matches model globs", () => {
    const doc = {
      version: "0.1.0" as const,
      variants: [
        {
          match: { model: "claude-*" },
          systemDelta: "Claude family delta",
          preferGrepVsSearch: false,
        },
      ],
    };
    const hit = resolveModelHarnessVariant(profile(), doc);
    expect(hit?.systemDelta).toBe("Claude family delta");
    expect(hit?.preferGrepVsSearch).toBe(false);
  });

  it("loads from .projectos/model-harness.json", () => {
    const root = mkdtempSync(join(tmpdir(), "pos-mh-"));
    mkdirSync(join(root, ".projectos"), { recursive: true });
    writeFileSync(
      join(root, ".projectos", "model-harness.json"),
      JSON.stringify({
        version: "0.1.0",
        variants: [
          {
            match: { modelProfileId: "model-a" },
            systemDelta: "From disk",
          },
        ],
      }),
      "utf8",
    );
    expect(loadModelHarnessDocument(root).variants).toHaveLength(1);
    expect(modelHarnessSystemDelta(profile(), root)).toBe("From disk");
  });
});
