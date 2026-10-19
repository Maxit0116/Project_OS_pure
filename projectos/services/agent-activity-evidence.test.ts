import { describe, expect, it } from "vitest";

import {
  boundTraceText,
  excerptWindow,
  hunkStats,
  verificationTraceFields,
  TRACE_TEXT_LIMIT,
} from "./agent-activity-evidence.js";

describe("agent activity evidence", () => {
  it("redacts secrets and truncates long command output", () => {
    const secret = `token sk-${"a".repeat(24)}`;
    const bounded = boundTraceText(`${secret}\n${"x".repeat(TRACE_TEXT_LIMIT)}`);
    expect(bounded.truncated).toBe(true);
    expect(bounded.text).not.toContain(secret);
    expect(bounded.text).toContain("[REDACTED]");
    expect(bounded.text.length).toBeLessThanOrEqual(TRACE_TEXT_LIMIT);
  });

  it("windows a read around the hit line", () => {
    const lines = Array.from({ length: 40 }, (_, index) => `line ${index + 1}`);
    const window = excerptWindow(lines.join("\n"), 20, 2);
    expect(window.startLine).toBe(18);
    expect(window.endLine).toBe(22);
    expect(window.excerpt).toContain("line 20");
    expect(window.excerpt).not.toContain("line 1\n");
    expect(window.truncated).toBe(true);
  });

  it("summarizes the first hunk without copying the full file", () => {
    const stats = hunkStats({
      changeType: "modify",
      before: "a\nb\nc\n",
      after: "a\nB\nc\n",
    });
    expect(stats).toEqual({
      additions: 1,
      deletions: 1,
      hunkHeader: "@@ -2,1 +2,1 @@",
    });
  });

  it("copies truncated stdout onto the verification trace", () => {
    const fields = verificationTraceFields({
      command: { command: "npm", args: ["test"], timeoutMs: 1000 },
      status: "failed",
      exitCode: 1,
      durationMs: 12,
      timedOut: false,
      outputTruncated: false,
      stdout: "FAIL_OUTPUT_BODY",
      stderr: "stack frame",
    });
    expect(fields.stdout).toBe("FAIL_OUTPUT_BODY");
    expect(fields.stderr).toBe("stack frame");
    expect(fields.exitCode).toBe(1);
    expect(fields.truncated).toBe(false);
  });
});
