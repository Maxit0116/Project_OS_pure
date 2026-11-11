import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { RulesCatalogClient } from "./client.js";
import {
  readBundledRulesCatalogBody,
  readBundledRulesCatalogPublicKey,
  readBundledRulesCatalogSignature,
} from "./bundled-assets.js";
import { defaultRulesCatalogCachePath } from "./cache.js";
import type { McpDnsLookup } from "../mcp/mcp-http-guard.js";

// The URL guard looks the host up; these tests use hosts that cannot resolve (".test"), so they say where it points.
const testDns: McpDnsLookup = async () => [{ address: "93.184.216.34" }];

describe("RulesCatalogClient", () => {
  it("falls back to bundled when remote fails", async () => {
    const cacheRoot = await mkdtemp(join(tmpdir(), "rules-cat-"));
    const client = new RulesCatalogClient({
      cacheRoot,
      publicKeySpkiBase64: readBundledRulesCatalogPublicKey(),
      defaultCatalogUrl: "https://catalog.example.test/rules/catalog.json",
      resolveDns: testDns,
      fetchImpl: vi.fn(async () => {
        throw new Error("offline");
      }) as unknown as typeof fetch,
    });
    const view = await client.getCatalog();
    expect(view.source).toBe("bundled");
    expect(view.document.listings.length).toBeGreaterThan(0);
  });

  it("rejects poisoned cache without valid signature", async () => {
    const cacheRoot = await mkdtemp(join(tmpdir(), "rules-cat-"));
    await mkdir(join(cacheRoot, "rules-catalog"), { recursive: true });
    await writeFile(
      defaultRulesCatalogCachePath(cacheRoot),
      JSON.stringify({
        bodyUtf8: JSON.stringify({
          version: "evil",
          listings: [
            {
              id: "evil",
              name: "Evil",
              trustTier: "community",
              version: "9",
              files: { "bad.md": "# bad\n" },
            },
          ],
        }),
        signatureBase64: "nope",
        fetchedAt: new Date().toISOString(),
        catalogUrl: "https://catalog.example.test/rules/catalog.json",
      }),
      "utf8",
    );
    const client = new RulesCatalogClient({
      cacheRoot,
      publicKeySpkiBase64: readBundledRulesCatalogPublicKey(),
      defaultCatalogUrl: "https://catalog.example.test/rules/catalog.json",
      resolveDns: testDns,
      fetchImpl: vi.fn(async () => {
        throw new Error("offline");
      }) as unknown as typeof fetch,
    });
    const view = await client.getCatalog();
    expect(view.source).toBe("bundled");
    expect(view.document.listings.every((l) => l.id !== "evil")).toBe(true);
  });

  it("caches verified remote catalog", async () => {
    const cacheRoot = await mkdtemp(join(tmpdir(), "rules-cat-"));
    const body = readBundledRulesCatalogBody();
    const sig = readBundledRulesCatalogSignature();
    const client = new RulesCatalogClient({
      cacheRoot,
      publicKeySpkiBase64: readBundledRulesCatalogPublicKey(),
      defaultCatalogUrl: "https://catalog.example.test/rules/catalog.json",
      resolveDns: testDns,
      fetchImpl: vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith(".sig")) return new Response(sig, { status: 200 });
        return new Response(body, { status: 200 });
      }) as unknown as typeof fetch,
    });
    const remote = await client.getCatalog({ forceRefresh: true });
    expect(remote.source).toBe("remote");
    const again = await client.getCatalog();
    expect(again.source).toBe("cache");
  });
});
