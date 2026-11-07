import { mkdtempSync, mkdirSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  assertMcpStdioConfigAllowed,
  McpStdioGuardError,
} from "./mcp-stdio-guard.js";

describe("mcp stdio guard", () => {
  it("allows commands with workspace-relative cwd", () => {
    const root = mkdtempSync(join(tmpdir(), "mcp-stdio-"));
    mkdirSync(join(root, "tools"));
    const guarded = assertMcpStdioConfigAllowed(
      {
        id: "local",
        name: "Local",
        enabled: true,
        transport: "stdio",
        command: "node",
        args: ["server.js"],
        cwd: "tools",
      },
      root,
    );
    expect(guarded.command).toBe("node");
    expect(guarded.cwd).toBe(realpathSync(join(root, "tools")));
  });

  it("rejects empty command and cwd outside workspace", () => {
    const root = mkdtempSync(join(tmpdir(), "mcp-stdio-"));
    expect(() => assertMcpStdioConfigAllowed(
      {
        id: "local",
        name: "Local",
        enabled: true,
        transport: "stdio",
      },
      root,
    )).toThrow(McpStdioGuardError);

    expect(() => assertMcpStdioConfigAllowed(
      {
        id: "local",
        name: "Local",
        enabled: true,
        transport: "stdio",
        command: "node",
        cwd: "/tmp",
      },
      root,
    )).toThrow(McpStdioGuardError);
  });
});
