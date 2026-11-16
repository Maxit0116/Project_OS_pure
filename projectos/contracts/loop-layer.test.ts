import { describe, expect, it } from "vitest";

import {
  computeLoopLayerFrameBounds,
  nextLoopLayerColorKey,
  nextLoopLayerTitle,
  normalizeMarqueeRect,
  pickNodesInMarquee,
  pruneLoopLayerMembers,
  resizeRectFromEdge,
  type LoopLayer,
} from "./loop-layer.js";

describe("loop-layer", () => {
  it("normalizes marquee and picks nodes by center", () => {
    const rect = normalizeMarqueeRect(100, 100, 40, 60);
    expect(rect).toEqual({ x: 40, y: 60, width: 60, height: 40 });
    const ids = pickNodesInMarquee(
      [
        { id: "a", x: 50, y: 70, width: 20, height: 20 }, // center 60,80 — inside
        { id: "b", x: 200, y: 200, width: 20, height: 20 }, // outside
      ],
      rect,
    );
    expect(ids).toEqual(["a"]);
  });

  it("computes formal frame with padding and title bar", () => {
    const frame = computeLoopLayerFrameBounds([
      { id: "a", x: 100, y: 100, width: 50, height: 40 },
      { id: "b", x: 180, y: 120, width: 40, height: 30 },
    ]);
    expect(frame).toEqual({
      x: 84,
      y: 56,
      width: 152,
      height: 110,
    });
  });

  it("resizes from edges and cycles colors/titles", () => {
    const base = { x: 0, y: 0, width: 100, height: 80 };
    expect(resizeRectFromEdge(base, "e", { x: 140, y: 40 })).toEqual({
      x: 0,
      y: 0,
      width: 140,
      height: 80,
    });
    expect(nextLoopLayerTitle(1)).toBe("Stage 1");
    const layers: LoopLayer[] = [];
    expect(nextLoopLayerColorKey(layers)).toBe("coral");
    layers.push({
      id: "ly1",
      title: "Stage 1",
      colorKey: "coral",
      memberNodeIds: ["a"],
    });
    expect(nextLoopLayerColorKey(layers)).toBe("sand");
  });

  it("prunes missing members and drops empty layers", () => {
    const next = pruneLoopLayerMembers(
      [
        {
          id: "ly1",
          title: "A",
          colorKey: "sky",
          memberNodeIds: ["keep", "gone"],
        },
        {
          id: "ly2",
          title: "B",
          colorKey: "sage",
          memberNodeIds: ["gone"],
        },
      ],
      new Set(["keep"]),
    );
    expect(next).toHaveLength(1);
    expect(next[0]?.memberNodeIds).toEqual(["keep"]);
  });
});
