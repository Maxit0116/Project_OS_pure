import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  confirmFirstPrinciplesThesis,
  createFirstPrinciplesSession,
  resolveFirstPrinciplesConflict,
  answerFirstPrinciplesTurn,
} from "./session-ops.js";
import { writePlannedFeatureFromThesis } from "./features-write.js";
import { mergeClaimUpdates } from "./explore-claims.js";

describe("first principles conflict + features", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("resolves conflict keep_right and marks claims", () => {
    let session = createFirstPrinciplesSession({
      projectId: "p1",
      vision: "我想加一个全新能力，仓库里没有",
    });
    session = {
      ...session,
      status: "conflict",
      activeQuestion: null,
      pendingConflict: {
        id: "c1",
        layerId: "L1",
        summary: "conflict",
        leftLabel: "仓库没有",
        rightLabel: "已有代码",
        leftClaimId: "left",
        evidenceRefs: ["src/a.ts#L1"],
      },
      atomicClaims: [
        { id: "left", text: "仓库没有", status: "assumed" },
      ],
    };
    session = resolveFirstPrinciplesConflict(session, "keep_right");
    expect(session.status).toBe("layer_active");
    expect(session.pendingConflict).toBeNull();
    expect(session.atomicClaims.some((c) => c.status === "contested")).toBe(true);
    expect(session.atomicClaims.some((c) => c.status === "evidenced")).toBe(true);
  });

  it("writes planned feature and respects locked", () => {
    const root = mkdtempSync(join(tmpdir(), "fp-feat-"));
    dirs.push(root);
    let session = createFirstPrinciplesSession({
      projectId: "p1",
      vision: "订阅功能",
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

    const first = writePlannedFeatureFromThesis(root, session);
    expect(first.written).toBe(true);
    expect(first.featureId).toBeTruthy();

    const path = join(root, ".projectos", "features.json");
    const doc = JSON.parse(readFileSync(path, "utf8")) as {
      features: Array<{ id: string; locked?: boolean; status?: string }>;
    };
    expect(doc.features[0]?.status).toBe("planned");

    // Lock and rewrite should skip
    doc.features[0]!.locked = true;
    writeFileSync(path, `${JSON.stringify(doc, null, 2)}\n`);
    const lockedSession = {
      ...session,
      featuresFeatureId: first.featureId!,
    };
    const second = writePlannedFeatureFromThesis(root, lockedSession);
    expect(second.written).toBe(false);
    expect(second.skippedLocked).toBe(true);
  });

  it("merges claim updates from LLM", () => {
    let session = createFirstPrinciplesSession({
      projectId: "p1",
      vision: "vision",
    });
    session = mergeClaimUpdates(session, [
      { text: "用户每周卡一次", status: "assumed" },
      { text: "用户每周卡一次", status: "evidenced", evidenceRefs: ["a.ts#L2"] },
    ]);
    expect(session.atomicClaims).toHaveLength(1);
    expect(session.atomicClaims[0]?.status).toBe("evidenced");
  });
});
