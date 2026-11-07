import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

import {
  confirmFirstPrinciplesThesis,
  createFirstPrinciplesSession,
  answerFirstPrinciplesTurn,
} from "../services/first-principles/session-ops.js";
import { writePlannedFeatureFromThesis } from "../services/first-principles/features-write.js";

const here = dirname(fileURLToPath(import.meta.url));
const projectosRoot = join(here, "..");

describe("features:check CLI process regression", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("accepts a real writePlannedFeatureFromThesis document via the features-check process", () => {
    const root = mkdtempSync(join(tmpdir(), "fp-feat-cli-"));
    dirs.push(root);
    let session = createFirstPrinciplesSession({
      projectId: "p1",
      vision: "CLI regression for planned feature write",
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
    const featuresPath = join(root, ".projectos", "features.json");
    const raw = JSON.parse(readFileSync(featuresPath, "utf8")) as {
      features: Array<Record<string, unknown>>;
    };
    expect(raw.features[0]).toMatchObject({
      mvp: expect.any(String),
      successSignal: expect.any(String),
      nonGoals: expect.any(Array),
    });

    const build = spawnSync(
      "npx",
      ["tsc", "-p", "tsconfig.features-check.json"],
      { cwd: projectosRoot, encoding: "utf8" },
    );
    expect(build.status, build.stderr).toBe(0);

    const check = spawnSync(
      "node",
      [join(projectosRoot, "dist/scripts/features-check.js"), featuresPath],
      { cwd: projectosRoot, encoding: "utf8" },
    );
    expect(check.status, check.stderr).toBe(0);
    expect(check.stdout).toMatch(/features:check ok/u);
  });

  it("rejects an unknown feature field through the same CLI process", () => {
    const root = mkdtempSync(join(tmpdir(), "fp-feat-cli-bad-"));
    dirs.push(root);
    const featuresPath = join(root, ".projectos", "features.json");
    // Minimal invalid doc: unknown key under features[].
    mkdirSync(join(root, ".projectos"), { recursive: true });
    writeFileSync(
      featuresPath,
      `${JSON.stringify({
        version: "0.1.0",
        manifest: { generator: "test" },
        epics: [{ id: "epic_a", name: "A" }],
        features: [{
          id: "f_bad",
          name: "Bad",
          epicId: "epic_a",
          inventThisField: "nope",
          steps: [],
        }],
      }, null, 2)}\n`,
    );

    const build = spawnSync(
      "npx",
      ["tsc", "-p", "tsconfig.features-check.json"],
      { cwd: projectosRoot, encoding: "utf8" },
    );
    expect(build.status, build.stderr).toBe(0);

    const check = spawnSync(
      "node",
      [join(projectosRoot, "dist/scripts/features-check.js"), featuresPath],
      { cwd: projectosRoot, encoding: "utf8" },
    );
    expect(check.status).not.toBe(0);
    expect(`${check.stdout}\n${check.stderr}`).toMatch(/Unrecognized key|inventThisField/u);
  });
});
