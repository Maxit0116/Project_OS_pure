import { describe, expect, it } from "vitest";
import { sanitizeErrorMessage } from "./sanitize-error-message.js";

describe("sanitizeErrorMessage", () => {
  it("redacts secrets and absolute home/tmp paths from child-failure diagnostics", () => {
    const text = sanitizeErrorMessage(
      "Delegated file task failed (1/2); task_a: /Users/terran/secret/proj/app/login/page.tsx api_key=sk-abcdefghijklmnop Bearer tok_live_123",
    );
    expect(text).not.toContain("/Users/terran");
    expect(text).not.toContain("sk-abcdefghijklmnop");
    expect(text).not.toContain("tok_live_123");
    expect(text).toContain("[path]");
    expect(text).toContain("[redacted]");
    expect(text).toContain("Delegated file task failed");
  });
});
