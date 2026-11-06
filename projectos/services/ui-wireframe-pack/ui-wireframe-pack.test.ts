import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  looksLikeWireframePackRequest,
  packAcceptanceRef,
  resolveImmutableAcceptanceRef,
  wireframeVsDiagramAmbiguous,
} from "../../contracts/ui-wireframe-pack.js";
import { detectStructGaps } from "./detect-struct-gaps.js";
import {
  bindWireframePackFeature,
  buildImplementAgainstPackBrief,
  freezeWireframePack,
  generateWireframePack,
  listWireframeGaps,
  markWireframePackRealized,
  scanWireframeStructGaps,
  upsertWireframeGap,
} from "./index.js";

describe("ui-wireframe-pack routing", () => {
  it("detects wireframe intents", () => {
    expect(looksLikeWireframePackRequest("生成一套线稿图 for 看板")).toBe(true);
    expect(
      looksLikeWireframePackRequest("from scratch UI screens for team board"),
    ).toBe(true);
    expect(looksLikeWireframePackRequest("draw a sequence diagram of auth")).toBe(
      false,
    );
  });

  it("flags ambiguity when both UI pack and diagram words appear", () => {
    expect(
      wireframeVsDiagramAmbiguous("wireframe screens and architecture diagram"),
    ).toBe(true);
  });

  it("ignores model attempts to loosen acceptance", () => {
    const frozen = packAcceptanceRef("wfp_1", 1);
    const result = resolveImmutableAcceptanceRef({
      frozenRef: frozen,
      modelProposedRef: "wireframe-pack@wfp_1@v0-draft",
    });
    expect(result.acceptanceRef).toBe(frozen);
    expect(result.ignoredModelProposal).toBe(true);
  });
});

describe("detectStructGaps", () => {
  it("flags main screens without CTA and empty regions", () => {
    const detectRoot = mkdtempSync(join(tmpdir(), "wfp-detect-"));
    try {
      const pack = generateWireframePack(detectRoot, {
        prompt: "demo",
        title: "Demo",
      });
      const main = pack.screens.find((s) => s.role === "main");
      expect(main).toBeTruthy();
      main!.regions = main!.regions.map((r) => ({ ...r, cta: undefined }));
      const gaps = detectStructGaps(pack);
      expect(gaps.some((g) => g.summary.includes("no primary CTA"))).toBe(true);
    } finally {
      rmSync(detectRoot, { recursive: true, force: true });
    }
  });
});

describe("ui-wireframe-pack store", () => {
  let root = "";

  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
  });

  it("generates, freezes, briefs, gaps, and realizes", () => {
    root = mkdtempSync(join(tmpdir(), "wfp-"));
    const pack = generateWireframePack(root, {
      prompt: "团队协作看板从 0 做前端",
      title: "Team board",
      featureId: "feat_board",
    });
    expect(pack.status).toBe("draft");
    expect(pack.featureId).toBe("feat_board");
    expect(pack.screens.length).toBeGreaterThanOrEqual(3);
    expect(pack.screens[0]?.html?.includes("data-wireframe-l1")).toBe(true);

    expect(() =>
      buildImplementAgainstPackBrief(root, pack.id),
    ).toThrow(/not frozen/);

    const frozen = freezeWireframePack(root, pack.id, { mode: "full" });
    expect(frozen.status).toBe("frozen");
    expect(frozen.version).toBe(1);
    expect(frozen.freezeMeta?.checksum).toBeTruthy();
    expect(frozen.freezeMeta?.mode).toBe("full");
    // freeze auto-scans struct gaps (may be empty for healthy packs)
    expect(Array.isArray(listWireframeGaps(root, pack.id))).toBe(true);

    const brief = buildImplementAgainstPackBrief(root, pack.id);
    expect(brief.acceptanceRef).toBe(packAcceptanceRef(pack.id, 1));
    expect(brief.promptForAgent).toContain(brief.acceptanceRef);
    expect(brief.screenSlices.length).toBeGreaterThan(0);
    expect(brief.loopAcceptance.length).toBeGreaterThan(0);
    expect(brief.featureId).toBe("feat_board");

    const gap = upsertWireframeGap(root, pack.id, {
      screenId: frozen.screens[0]!.id,
      layer: "struct",
      severity: "block",
      summary: "Missing primary CTA",
    });
    expect(listWireframeGaps(root, pack.id).some((g) => g.id === gap.id)).toBe(
      true,
    );
    expect(() => markWireframePackRealized(root, pack.id)).toThrow(/block/);

    upsertWireframeGap(root, pack.id, {
      id: gap.id,
      screenId: gap.screenId,
      layer: "struct",
      summary: gap.summary,
      status: "accepted_intentional",
      resolutionNote: "CTA deferred to Stencil polish",
    });

    const realized = markWireframePackRealized(root, pack.id);
    expect(realized.status).toBe("realized");
  });

  it("supports partial main_path freeze and feature rebind", () => {
    root = mkdtempSync(join(tmpdir(), "wfp-partial-"));
    const pack = generateWireframePack(root, {
      prompt: "multi screen app",
      title: "App",
    });
    const frozen = freezeWireframePack(root, pack.id, { mode: "main_path" });
    expect(frozen.freezeMeta?.mode).toBe("main_path");
    const mainIds = frozen.screens
      .filter((s) => s.role === "main")
      .map((s) => s.id);
    expect(frozen.freezeMeta?.frozenScreenIds).toEqual(mainIds);

    const brief = buildImplementAgainstPackBrief(root, pack.id);
    expect(brief.freezeMode).toBe("main_path");
    expect(
      brief.screens.filter((s) => s.inAcceptanceScope).every((s) => s.role === "main"),
    ).toBe(true);

    const rebound = bindWireframePackFeature(root, pack.id, "feat_x");
    expect(rebound.featureId).toBe("feat_x");

    const gaps = scanWireframeStructGaps(root, pack.id, {
      previewHtmlByScreen: {
        [mainIds[0]!]: "<div>totally unrelated preview</div>",
      },
    });
    expect(gaps.length).toBeGreaterThan(0);
  });
});
