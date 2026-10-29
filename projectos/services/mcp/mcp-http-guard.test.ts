import { describe, expect, it, vi } from "vitest";

import {
  assertMcpHttpHostResolvesSafely,
  assertMcpHttpUrlAllowed,
  createMcpGuardedFetch,
  MCP_HTTP_MAX_BODY_BYTES,
  McpHttpGuardError,
} from "./mcp-http-guard.js";

describe("mcp http guard", () => {
  it("allows public https and loopback http", () => {
    expect(assertMcpHttpUrlAllowed("https://mcp.example.test/mcp").hostname)
      .toBe("mcp.example.test");
    expect(assertMcpHttpUrlAllowed("http://127.0.0.1:3100/mcp").hostname)
      .toBe("127.0.0.1");
  });

  it("rejects metadata, private, and non-http schemes", () => {
    expect(() => assertMcpHttpUrlAllowed("http://169.254.169.254/latest"))
      .toThrow(McpHttpGuardError);
    expect(() => assertMcpHttpUrlAllowed("http://192.168.1.10/mcp"))
      .toThrow(McpHttpGuardError);
    expect(() => assertMcpHttpUrlAllowed("http://10.0.0.5/mcp"))
      .toThrow(McpHttpGuardError);
    expect(() => assertMcpHttpUrlAllowed("file:///tmp/mcp"))
      .toThrow(McpHttpGuardError);
    expect(() => assertMcpHttpUrlAllowed("http://user:pass@example.test/mcp"))
      .toThrow(McpHttpGuardError);
  });

  it("rejects DNS that resolves to blocked addresses", async () => {
    await expect(
      assertMcpHttpHostResolvesSafely(
        new URL("https://evil.example.test/mcp"),
        async () => [{ address: "169.254.169.254" }],
      ),
    ).rejects.toThrow(McpHttpGuardError);

    await expect(
      assertMcpHttpHostResolvesSafely(
        new URL("https://ok.example.test/mcp"),
        async () => [{ address: "93.184.216.34" }],
      ),
    ).resolves.toBeUndefined();
  });

  it("guards fetch redirects and oversized content-length", async () => {
    const baseFetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.redirect).toBe("error");
      return new Response("ok", {
        status: 200,
        headers: { "content-length": String(MCP_HTTP_MAX_BODY_BYTES + 1) },
      });
    });
    const guarded = createMcpGuardedFetch(baseFetch as typeof fetch);

    await expect(guarded("http://127.0.0.1:3999/mcp")).rejects.toThrow(
      /byte limit/u,
    );
    expect(baseFetch).toHaveBeenCalledTimes(1);
  });

  it("rejects guarded fetch to private hosts before calling base fetch", async () => {
    const baseFetch = vi.fn(async () => new Response("nope"));
    const guarded = createMcpGuardedFetch(baseFetch as typeof fetch);
    await expect(guarded("http://192.168.0.5/mcp")).rejects.toThrow(McpHttpGuardError);
    expect(baseFetch).not.toHaveBeenCalled();
  });
});
