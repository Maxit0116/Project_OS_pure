import { describe, expect, it, vi } from "vitest";

import { fetchLoopUrlMaterial } from "./loop-url-material-fetch.js";

describe("loop-url-material-fetch (production read-only)", () => {
  it("denies localhost before network", async () => {
    const fetchImpl = vi.fn();
    const result = await fetchLoopUrlMaterial("http://127.0.0.1/secret", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      allowHttp: true,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toMatch(/ssrf|scheme|dns/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("re-classifies redirect to private host as redirect_denied", async () => {
    const fetchImpl = vi.fn(async () => {
      return {
        status: 302,
        ok: false,
        headers: { get: (name: string) => (name === "location" ? "https://127.0.0.1/x" : null) },
        arrayBuffer: async () => new ArrayBuffer(0),
      };
    });
    const result = await fetchLoopUrlMaterial("https://example.com/doc", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      lookupFn: async () => [{ address: "93.184.216.34", family: 4 }],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("redirect_denied");
  });

  it("returns capped plaintext for public hop (DI fetch)", async () => {
    const body = "<html><script>x</script><p>Hello materials</p></html>";
    const fetchImpl = vi.fn(async () => ({
      status: 200,
      ok: true,
      headers: {
        get: (name: string) =>
          name === "content-type" ? "text/html; charset=utf-8" : null,
      },
      arrayBuffer: async () => Uint8Array.from(Buffer.from(body)).buffer,
    }));
    const result = await fetchLoopUrlMaterial("https://example.com/a", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      lookupFn: async () => [{ address: "93.184.216.34", family: 4 }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.textPreview).toMatch(/Hello materials/);
    expect(result.textPreview).not.toMatch(/script/);
    expect(result.redirectHops).toBe(0);
  });

  it("denies DNS answers in private ranges", async () => {
    const fetchImpl = vi.fn();
    const result = await fetchLoopUrlMaterial("https://evil.example/x", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      lookupFn: async () => [{ address: "10.0.0.5", family: 4 }],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("dns_denied");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("denies non-allowlisted ports", async () => {
    const fetchImpl = vi.fn();
    const result = await fetchLoopUrlMaterial("https://example.com:8443/x", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      lookupFn: async () => [{ address: "93.184.216.34", family: 4 }],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("blocked_port");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("treats login walls as not-readable documents", async () => {
    const body =
      '<html><form><input type="password" name="password"/><button>Sign in</button></form></html>';
    const fetchImpl = vi.fn(async () => ({
      status: 200,
      ok: true,
      headers: {
        get: (name: string) =>
          name === "content-type" ? "text/html; charset=utf-8" : null,
      },
      arrayBuffer: async () => Uint8Array.from(Buffer.from(body)).buffer,
    }));
    const result = await fetchLoopUrlMaterial("https://example.com/login", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      lookupFn: async () => [{ address: "93.184.216.34", family: 4 }],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("login_wall");
  });

  it("propagates AbortSignal as cancelled", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchImpl = vi.fn();
    const result = await fetchLoopUrlMaterial("https://example.com/a", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      lookupFn: async () => [{ address: "93.184.216.34", family: 4 }],
      signal: controller.signal,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("cancelled");
  });

  it("denies IPv4-mapped private IPv6 DNS answers", async () => {
    const fetchImpl = vi.fn();
    const result = await fetchLoopUrlMaterial("https://evil.example/x", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      lookupFn: async () => [{ address: "::ffff:192.168.1.10", family: 6 }],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("dns_denied");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
