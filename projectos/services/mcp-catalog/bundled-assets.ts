/**
 * Bundled MCP catalog assets.
 *
 * These must be string constants (not runtime `readFileSync` beside `import.meta.url`):
 * electron-vite packs services into `desktop/out/main/index.js` and does not copy the
 * `bundled/` directory next to that chunk. Reading from disk there throws ENOENT on the
 * first `getProjectOsService()` call — which blocks `openWorkspace`.
 *
 * Keep `bundled/catalog.json` (+ `.sig` / `.pubkey.b64`) as the editable source of truth;
 * when regenerating signatures, update the constants below to match.
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Editable on-disk copies (vitest / source tree). Prefer these when present so edits apply without rebuilding constants. */
function readFromSourceTree(fileName: string): string | undefined {
  try {
    const dir = join(dirname(fileURLToPath(import.meta.url)), "bundled");
    const path = join(dir, fileName);
    if (!existsSync(path)) return undefined;
    return readFileSync(path, "utf8");
  } catch {
    return undefined;
  }
}

const EMBEDDED_CATALOG_BODY = `{
  "version": "1",
  "generatedAt": "2026-10-29T00:00:00.000Z",
  "listings": [
    {
      "id": "curated.filesystem",
      "name": "Filesystem (demo)",
      "description": "Official-demo style stdio filesystem MCP server via npx.",
      "trustTier": "curated",
      "version": "1.0.0",
      "homepage": "https://modelcontextprotocol.io",
      "requiresAuth": false,
      "transport": "stdio",
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "."
      ]
    },
    {
      "id": "community.everything",
      "name": "Everything (community demo)",
      "description": "Community-tier example listing. Review the command before enabling.",
      "trustTier": "community",
      "version": "0.1.0",
      "requiresAuth": false,
      "transport": "stdio",
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-everything"
      ]
    },
    {
      "id": "curated.http-echo",
      "name": "HTTP Echo (placeholder)",
      "description": "Example http transport listing pointing at loopback for local demos.",
      "trustTier": "curated",
      "version": "1.0.0",
      "requiresAuth": true,
      "transport": "http",
      "url": "http://127.0.0.1:3921/mcp"
    }
  ]
}
`;

const EMBEDDED_CATALOG_SIGNATURE =
  "skcLx9DW0c9JJDPyUaR5bd81vdo/R30BM0NCbzAyfHBfgICY7X/WpqMMd9nlHw9HSzIJc6nMO4OFBGzWyWNdDw==";

const EMBEDDED_CATALOG_PUBLIC_KEY =
  "MCowBQYDK2VwAyEAyn+Ohu+IFP1+a5WUaeYuN7le10P03jStcWIav1KQRxg=";

export function readBundledCatalogBody(): string {
  return readFromSourceTree("catalog.json") ?? EMBEDDED_CATALOG_BODY;
}

export function readBundledCatalogSignature(): string {
  return (readFromSourceTree("catalog.json.sig") ?? EMBEDDED_CATALOG_SIGNATURE).trim();
}

export function readBundledCatalogPublicKey(): string {
  return (readFromSourceTree("catalog.pubkey.b64") ?? EMBEDDED_CATALOG_PUBLIC_KEY).trim();
}
