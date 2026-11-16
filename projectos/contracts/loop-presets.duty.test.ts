import { describe, expect, it } from "vitest";

import {
  createNodeFromPaletteItem,
  getLoopPaletteItem,
} from "./loop-presets.js";

describe("loop palette duty seeds", () => {
  it("seeds dutyItems from capability prompt for duty nodes", () => {
    const item = getLoopPaletteItem("human.approval");
    expect(item).toBeTruthy();
    const node = createNodeFromPaletteItem(item!, {
      id: "n1",
      position: { x: 0, y: 0 },
    });
    expect(node.dutyItems?.length).toBeGreaterThan(0);
    expect(node.dutyItems?.[0]?.source).toBe("palette");
    expect(node.dutyItems?.[0]?.kind).toBe("human");
  });

  it("does not seed dutyItems for config satellites", () => {
    const item = getLoopPaletteItem("config.model");
    expect(item).toBeTruthy();
    const node = createNodeFromPaletteItem(item!, {
      id: "c1",
      position: { x: 0, y: 0 },
    });
    expect(node.dutyItems).toBeUndefined();
  });
});
