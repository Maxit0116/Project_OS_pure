import { describe, expect, it } from "vitest";

import {
  LOOP_IMAGE_MATERIAL_MAX_BYTES,
  evaluateImageMaterialCapability,
} from "./loop-material-vision-preflight.js";

describe("loop-material-vision-preflight", () => {
  it("blocks images when apiFormat lacks vision (not silently dropped)", () => {
    const result = evaluateImageMaterialCapability({
      mimeType: "image/png",
      fileName: "shot.png",
      sizeBytes: 1200,
      apiFormat: "ollama_chat",
      hasBytes: true,
    });
    expect(result.parseLevel).toBe("unsupported");
    expect(result.visionGate).toBe("model_lacks_vision");
  });

  it("wires vision_attach for openai_chat when bytes present", () => {
    const result = evaluateImageMaterialCapability({
      mimeType: "image/jpeg",
      fileName: "photo.jpg",
      sizeBytes: 2048,
      apiFormat: "openai_chat",
      hasBytes: true,
    });
    expect(result.parseLevel).toBe("vision_attach");
    expect(result.visionGate).toBe("vision_wired");
  });

  it("refuses oversize without discarding the card classification", () => {
    const result = evaluateImageMaterialCapability({
      mimeType: "image/png",
      fileName: "big.png",
      sizeBytes: LOOP_IMAGE_MATERIAL_MAX_BYTES + 1,
      apiFormat: "anthropic_messages",
      hasBytes: true,
    });
    expect(result.visionGate).toBe("oversize");
    expect(result.parseLevel).toBe("unsupported");
  });
});
