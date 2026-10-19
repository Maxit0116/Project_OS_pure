import { describe, expect, it } from "vitest";

import { ProjectOSError } from "../../errors.js";
import {
  assertToolAllowed,
  evaluateToolCall,
  harnessToolNameFromAgentTool,
  readCapabilityContext,
  writeCapabilityContext,
} from "./tool-policy.js";

describe("ToolPolicy v0 (H0)", () => {
  const readCtx = readCapabilityContext({
    mode: "ask",
    allowedReadPaths: ["src/a.ts", "src/b.ts"],
  });

  const writeCtx = writeCapabilityContext({
    mode: "change",
    allowedWritePaths: ["src/a.ts"],
  });

  it("allows read_file inside allowedReadPaths", () => {
    expect(
      evaluateToolCall({ tool: "read_file", path: "src/a.ts" }, readCtx),
    ).toMatchObject({ decision: "allow" });
  });

  it("denies read_file outside allowedReadPaths", () => {
    expect(
      evaluateToolCall({ tool: "read_file", path: "src/secret.ts" }, readCtx),
    ).toMatchObject({
      decision: "deny",
      reason: expect.stringContaining("outside allowedReadPaths"),
    });
  });

  it("denies write tools when writeCapability is false (Ask mode)", () => {
    expect(
      evaluateToolCall({ tool: "generate_diff", path: "src/a.ts" }, readCtx),
    ).toMatchObject({
      decision: "deny",
      reason: expect.stringContaining("writeCapability=false"),
    });
  });

  it("allows generate_diff for the single authorized leaf path", () => {
    expect(
      evaluateToolCall({ tool: "generate_diff", path: "src/a.ts" }, writeCtx),
    ).toMatchObject({ decision: "allow" });
  });

  it("denies generate_diff for an unauthorized path", () => {
    expect(
      evaluateToolCall({ tool: "generate_diff", path: "src/other.ts" }, writeCtx),
    ).toMatchObject({
      decision: "deny",
      reason: expect.stringContaining("outside allowedWritePaths"),
    });
  });

  it("denies generate_diff when zero write paths are bound", () => {
    const planner = writeCapabilityContext({
      mode: "change",
      allowedWritePaths: [],
    });
    // writeCapabilityContext always sets writeCapability true; empty paths still deny.
    expect(
      evaluateToolCall({ tool: "generate_diff", path: "src/a.ts" }, planner),
    ).toMatchObject({
      decision: "deny",
      reason: expect.stringContaining("zero write authorization"),
    });
  });

  it("denies unknown tools", () => {
    expect(
      evaluateToolCall({ tool: "rm_rf" }, writeCtx),
    ).toMatchObject({
      decision: "deny",
      reason: expect.stringContaining("Unknown tool"),
    });
  });

  it("denies shell / mcp / fetch without an allow rule; grep stays non-callable", () => {
    for (const tool of ["shell", "mcp_tool", "fetch"] as const) {
      expect(evaluateToolCall({ tool }, writeCtx).decision).toBe("deny");
    }
    expect(evaluateToolCall({ tool: "grep_workspace" }, writeCtx).decision).toBe(
      "deny",
    );
  });

  it("allows list_files as read-only metadata", () => {
    expect(evaluateToolCall({ tool: "list_files" }, readCtx).decision).toBe(
      "allow",
    );
  });

  it("assertToolAllowed throws tool_policy_denied", () => {
    expect(() =>
      assertToolAllowed({ tool: "read_file", path: "nope.ts" }, readCtx),
    ).toThrow(ProjectOSError);
    try {
      assertToolAllowed({ tool: "read_file", path: "nope.ts" }, readCtx);
    } catch (error) {
      expect(error).toBeInstanceOf(ProjectOSError);
      expect((error as ProjectOSError).code).toBe("tool_policy_denied");
    }
  });

  it("maps legacy agent-tool names", () => {
    expect(harnessToolNameFromAgentTool("readFile")).toBe("read_file");
    expect(harnessToolNameFromAgentTool("listFiles")).toBe("list_files");
    expect(harnessToolNameFromAgentTool("getContext")).toBe("get_context");
  });

  it("rejects multi-path writes that escape a single-leaf authorization", () => {
    expect(
      evaluateToolCall(
        { tool: "apply_diff", paths: ["src/a.ts", "src/b.ts"] },
        writeCtx,
      ),
    ).toMatchObject({
      decision: "deny",
      reason: expect.stringContaining("outside allowedWritePaths"),
    });
  });

  it("allows multi-path writes when authorization lists every path (fixture)", () => {
    const fixture = writeCapabilityContext({
      allowedWritePaths: ["src/a.ts", "src/b.ts"],
    });
    expect(
      evaluateToolCall(
        { tool: "generate_diff", paths: ["src/a.ts", "src/b.ts"] },
        fixture,
      ).decision,
    ).toBe("allow");
  });
});
