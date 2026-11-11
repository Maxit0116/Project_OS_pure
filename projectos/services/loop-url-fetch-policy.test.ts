import { describe, expect, it } from "vitest";
import {
  classifyLoopMaterialUrl,
  classifyRedirectHop,
} from "./loop-url-fetch-policy.js";

describe("loop-url-fetch-policy", () => {
  it("allows https public hosts and denies localhost / private IPs", () => {
    expect(classifyLoopMaterialUrl("https://example.com/docs").ok).toBe(true);
    expect(classifyLoopMaterialUrl("http://example.com/x").ok).toBe(false);
    expect(classifyLoopMaterialUrl("https://localhost/secret").ok).toBe(false);
    expect(classifyLoopMaterialUrl("https://127.0.0.1/").ok).toBe(false);
    expect(classifyLoopMaterialUrl("https://169.254.169.254/latest").ok).toBe(
      false,
    );
    expect(classifyLoopMaterialUrl("https://10.0.0.8/internal").ok).toBe(false);
    expect(classifyLoopMaterialUrl("https://192.168.1.1/").ok).toBe(false);
  });

  it("denies redirect hops into private space", () => {
    const start = classifyLoopMaterialUrl("https://example.com/start");
    expect(start.ok).toBe(true);
    if (!start.ok) return;
    const denied = classifyRedirectHop(start, "https://127.0.0.1/steal");
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.code).toBe("redirect_denied");
  });
});
