import { describe, expect, it } from "vitest";

import {
  LOOP_IMAGE_MATERIAL_MAX_BYTES,
  evaluateImageMaterialCapability,
} from "./loop-material-vision-preflight.js";

describe("loop-material-vision-preflight", () => {
  it("keeps images as unsupported + model_lacks_vision by default (not dropped)", () => {
    const result = evaluateImageMaterialCapability({
      mimeType: "image/png",
      fileName: "shot.png",
      sizeBytes: 1200,
    });
    expect(result.parseLevel).toBe("unsupported");
    expect(result.visionGate).toBe("model_lacks_vision");
    expect(result.format.formatId).toBe("image");
    expect(result.reason).toMatch(/not silently dropped/i);
  });

  it("marks eligible_not_wired when model has vision but Pure attach is absent", () => {
    const result = evaluateImageMaterialCapability({
      mimeType: "image/jpeg",
      fileName: "photo.jpg",
      sizeBytes: 2048,
      supportsVision: true,
    });
    expect(result.parseLevel).toBe("unsupported");
    expect(result.visionGate).toBe("eligible_not_wired");
    expect(result.reason).toMatch(/not wired/i);
  });

  it("refuses oversize without discarding the classification", () => {
    const result = evaluateImageMaterialCapability({
      mimeType: "image/png",
      fileName: "big.png",
      sizeBytes: LOOP_IMAGE_MATERIAL_MAX_BYTES + 1,
      supportsVision: true,
    });
    expect(result.visionGate).toBe("oversize");
    expect(result.parseLevel).toBe("unsupported");
  });

  it("does not invent image gates for csv text_preview", () => {
    const result = evaluateImageMaterialCapability({
      mimeType: "text/csv",
      fileName: "rows.csv",
      supportsVision: true,
    });
    expect(result.visionGate).toBe("not_image");
    expect(result.format.parseLevel).toBe("text_preview");
  });
});
