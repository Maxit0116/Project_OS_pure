import { describe, expect, it } from "vitest";

import {
  apiFormatSupportsVision,
  materialImagesToGatewayParts,
  materialsRequireVision,
  resolveLoopVisionCapability,
} from "./loop-material-vision-capability.js";

describe("loop-material-vision-capability (ModelGateway)", () => {
  it("marks openai_chat / anthropic_messages as vision-capable; ollama not", () => {
    expect(apiFormatSupportsVision("openai_chat")).toBe(true);
    expect(apiFormatSupportsVision("anthropic_messages")).toBe(true);
    expect(apiFormatSupportsVision("ollama_chat")).toBe(false);
  });

  it("resolves capability from model profile apiFormat", () => {
    const openai = resolveLoopVisionCapability({
      id: "p1",
      name: "gpt",
      provider: "openai",
      model: "gpt-4o",
      apiKeyRef: "k",
    });
    expect(openai.supportsVision).toBe(true);
    expect(openai.apiFormat).toBe("openai_chat");

    const ollama = resolveLoopVisionCapability({
      id: "p2",
      name: "local",
      provider: "ollama",
      model: "llava",
      apiKeyRef: "",
    });
    expect(ollama.supportsVision).toBe(false);
  });

  it("builds ModelGateway images[] from verified PNG data: contentRef materials", () => {
    const pngB64 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nK0AAAAASUVORK5CYII=";
    const parts = materialImagesToGatewayParts([
      {
        id: "img1",
        kind: "image",
        purpose: "error_screenshot",
        title: "shot.png",
        source: "upload",
        parseStatus: "ok",
        parseLevel: "vision_attach",
        mimeType: "image/png",
        contentRef: `data:image/png;base64,${pngB64}`,
        createdAt: new Date().toISOString(),
      },
    ]);
    expect(parts).toEqual([{ mimeType: "image/png", base64: pngB64 }]);
    expect(materialsRequireVision([{ kind: "image" } as never])).toBe(true);
  });

  it("rejects magic-mismatch and upload:// contentRef (no silent attach)", () => {
    expect(
      materialImagesToGatewayParts([
        {
          id: "bad",
          kind: "image",
          purpose: "error_screenshot",
          title: "x.png",
          source: "upload",
          parseStatus: "ok",
          parseLevel: "vision_attach",
          contentRef: "data:image/png;base64,YWJjMTIz",
          createdAt: new Date().toISOString(),
        },
      ]),
    ).toEqual([]);
    expect(
      materialImagesToGatewayParts([
        {
          id: "path",
          kind: "image",
          purpose: "error_screenshot",
          title: "x.png",
          source: "upload",
          parseStatus: "ok",
          parseLevel: "vision_attach",
          contentRef: "upload://x.png",
          createdAt: new Date().toISOString(),
        },
      ]),
    ).toEqual([]);
  });
});
