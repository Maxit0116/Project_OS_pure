import { describe, expect, it } from "vitest";

import { projectMaterialsForNode } from "./loop-material-project.js";

describe("projectMaterialsForNode", () => {
  it("scopes by bindingNodeIds and attaches gateway images when vision ok", () => {
    const projected = projectMaterialsForNode({
      nodeId: "n_impl",
      modelProfile: {
        id: "p",
        name: "gpt",
        provider: "openai",
        model: "gpt-4o",
        apiKeyRef: "k",
      },
      materials: [
        {
          id: "t1",
          kind: "table",
          purpose: "test_data",
          title: "rows.csv",
          source: "upload",
          parseStatus: "ok",
          parseLevel: "structured_selection",
          textPreview: "name,score\nbob,2",
          tablePreview: { columns: ["name", "score"], rowStart: 2, rowEnd: 2 },
          bindingNodeIds: ["n_impl"],
          createdAt: new Date().toISOString(),
        },
        {
          id: "other",
          kind: "text",
          purpose: "requirement",
          title: "other",
          source: "paste",
          parseStatus: "ok",
          parseLevel: "text_preview",
          textPreview: "should not include",
          bindingNodeIds: ["n_test"],
          createdAt: new Date().toISOString(),
        },
        {
          id: "img",
          kind: "image",
          purpose: "error_screenshot",
          title: "x.png",
          source: "upload",
          parseStatus: "ok",
          parseLevel: "vision_attach",
          contentRef:
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nK0AAAAASUVORK5CYII=",
          bindingNodeIds: ["n_impl"],
          createdAt: new Date().toISOString(),
        },
      ],
    });
    expect(projected.materials.map((m) => m.id).sort()).toEqual(["img", "t1"]);
    expect(projected.textBundle).toMatch(/structured_selection|name,score/);
    expect(projected.textBundle).not.toMatch(/should not include/);
    expect(projected.images).toEqual([
      {
        mimeType: "image/png",
        base64:
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nK0AAAAASUVORK5CYII=",
      },
    ]);
    expect(projected.visionBlocked).toBe(false);
  });

  it("blocks vision projection for ollama profiles", () => {
    const projected = projectMaterialsForNode({
      modelProfile: {
        id: "p",
        name: "local",
        provider: "ollama",
        model: "llama",
        apiKeyRef: "",
      },
      materials: [
        {
          id: "img",
          kind: "image",
          purpose: "error_screenshot",
          title: "x.png",
          source: "upload",
          parseStatus: "unsupported",
          parseLevel: "unsupported",
          contentRef:
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nK0AAAAASUVORK5CYII=",
          createdAt: new Date().toISOString(),
        },
      ],
    });
    expect(projected.visionBlocked).toBe(true);
    expect(projected.images).toEqual([]);
  });
});
