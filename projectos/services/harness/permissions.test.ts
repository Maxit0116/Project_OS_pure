import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  loadToolPermissionDocument,
  resolvePermissionRules,
} from "./permissions.js";
import { evaluateToolCall, readCapabilityContext } from "./tool-policy.js";

describe("ToolPolicy v1 permissions (H3.A)", () => {
  const askCtx = readCapabilityContext({
    mode: "ask",
    allowedReadPaths: ["src/a.ts"],
  });

  it("Deny beats Allow for the same tool", () => {
    const effect = resolvePermissionRules(
      [
        { effect: "allow", tool: "mcp_tool" },
        { effect: "deny", tool: "mcp_tool", match: "mcp:evil:*" },
      ],
      "mcp_tool",
      "mcp:evil:rm",
    );
    expect(effect).toBe("deny");
  });

  it("allows MCP only when an allow rule matches", () => {
    const rules = [
      { effect: "allow" as const, tool: "mcp_tool" as const, match: "mcp:docs:*" },
    ];
    expect(
      evaluateToolCall(
        { tool: "mcp_tool", match: "mcp:docs:search" },
        askCtx,
        { rules },
      ).decision,
    ).toBe("allow");
    expect(
      evaluateToolCall(
        { tool: "mcp_tool", match: "mcp:other:x" },
        askCtx,
        { rules },
      ).decision,
    ).toBe("deny");
  });

  it("returns ask when permissions require approval", () => {
    expect(
      evaluateToolCall(
        { tool: "shell", match: "npm test" },
        askCtx,
        { rules: [{ effect: "ask", tool: "shell" }] },
      ),
    ).toMatchObject({ decision: "ask" });
  });

  it("loads .projectos/permissions.json", () => {
    const root = mkdtempSync(join(tmpdir(), "pos-perm-"));
    mkdirSync(join(root, ".projectos"), { recursive: true });
    writeFileSync(
      join(root, ".projectos", "permissions.json"),
      JSON.stringify({
        version: "0.1.0",
        rules: [{ effect: "allow", tool: "mcp_tool", match: "mcp:ok:*" }],
      }),
      "utf8",
    );
    const doc = loadToolPermissionDocument(root);
    expect(doc.rules).toHaveLength(1);
    expect(doc.rules[0]?.effect).toBe("allow");
  });

  it("falls back to empty rules when file is missing", () => {
    const root = mkdtempSync(join(tmpdir(), "pos-noperm-"));
    expect(loadToolPermissionDocument(root).rules).toEqual([]);
  });
});
