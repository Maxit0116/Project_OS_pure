import { describe, expect, it } from "vitest";
import {
  describeOfflineConnector,
  invokeOfflineConnector,
} from "./loop-connector-offline.js";

describe("Slack/Lark SaaS actions stay fail-closed offline", () => {
  it("blocks Slack/Lark invoke with next-step guidance (logo ≠ executable)", () => {
    for (const kind of ["slack", "lark"] as const) {
      const descriptor = describeOfflineConnector(kind, "unconfigured");
      const result = invokeOfflineConnector(descriptor, "post_message");
      expect(result.ok).toBe(false);
      expect(result.blocked).toBe(true);
      expect(result.message).toMatch(/Configure|Connect|offline/i);
    }
  });
});
