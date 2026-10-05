import { describe, expect, it } from "vitest";
import { decodeBase64ToBytes } from "./base64.js";

describe("decodeBase64ToBytes", () => {
  it("decodes base64 audio payloads without Node Buffer", () => {
    const bytes = decodeBase64ToBytes("aGVsbG8=");
    expect(Array.from(bytes)).toEqual([104, 101, 108, 108, 111]);
  });
});
