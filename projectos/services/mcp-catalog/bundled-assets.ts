/**
 * Bundled MCP catalog assets.
 *
 * These must be string constants (not runtime `readFileSync` beside `import.meta.url`):
 * electron-vite packs services into `desktop/out/main/index.js` and does not copy the
 * `bundled/` directory next to that chunk. Reading from disk there throws ENOENT on the
 * first `getProjectOsService()` call — which blocks `openWorkspace`.
 *
 * Keep `bundled/catalog.json` (+ `.sig` / `.pubkey.b64`) as the editable source of truth;
 * when regenerating signatures, update the constants below to match
 * (`node projectos/services/mcp-catalog/scripts/rebuild-bundled-catalog.mjs`).
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

const EMBEDDED_CATALOG_BODY = "{\n  \"version\": \"1\",\n  \"generatedAt\": \"2026-10-29T13:30:52.765Z\",\n  \"listings\": [\n    {\n      \"id\": \"curated.playwright\",\n      \"name\": \"Playwright MCP\",\n      \"description\": \"Official Microsoft Playwright MCP — browser automation via accessibility snapshots (npx @playwright/mcp). Requires Node.js 18+.\",\n      \"trustTier\": \"curated\",\n      \"version\": \"0.0.83\",\n      \"homepage\": \"https://github.com/microsoft/playwright-mcp\",\n      \"requiresAuth\": false,\n      \"transport\": \"stdio\",\n      \"command\": \"npx\",\n      \"args\": [\n        \"-y\",\n        \"@playwright/mcp@latest\"\n      ]\n    },\n    {\n      \"id\": \"curated.chrome-devtools\",\n      \"name\": \"Chrome DevTools MCP\",\n      \"description\": \"Official Google Chrome DevTools MCP — control and inspect a live Chrome browser for automation, debugging, screenshots, and performance traces. Requires Node.js LTS and Chrome stable.\",\n      \"trustTier\": \"curated\",\n      \"version\": \"1.12.0\",\n      \"homepage\": \"https://github.com/ChromeDevTools/chrome-devtools-mcp\",\n      \"requiresAuth\": false,\n      \"transport\": \"stdio\",\n      \"command\": \"npx\",\n      \"args\": [\n        \"-y\",\n        \"chrome-devtools-mcp@latest\"\n      ]\n    },\n    {\n      \"id\": \"curated.context7\",\n      \"name\": \"Context7\",\n      \"description\": \"Upstash Context7 remote MCP — up-to-date, version-specific library docs and code examples (resolve-library-id, query-docs). Paste a Context7 API key at install for higher rate limits (context7.com/dashboard).\",\n      \"trustTier\": \"curated\",\n      \"version\": \"4.4.4\",\n      \"homepage\": \"https://context7.com\",\n      \"requiresAuth\": true,\n      \"transport\": \"http\",\n      \"url\": \"https://mcp.context7.com/mcp\"\n    },\n    {\n      \"id\": \"curated.filesystem\",\n      \"name\": \"Filesystem MCP\",\n      \"description\": \"Official Model Context Protocol filesystem server — read/write/search within allowed directories. Default allow-list is the workspace root (`.`). Edit args after install to add more absolute paths.\",\n      \"trustTier\": \"curated\",\n      \"version\": \"2.1.0\",\n      \"homepage\": \"https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem\",\n      \"requiresAuth\": false,\n      \"transport\": \"stdio\",\n      \"command\": \"npx\",\n      \"args\": [\n        \"-y\",\n        \"@modelcontextprotocol/server-filesystem@latest\",\n        \".\"\n      ]\n    },\n    {\n      \"id\": \"community.storybook-mcp\",\n      \"name\": \"Storybook MCP Addon\",\n      \"description\": \"Storybook official MCP addon (@storybook/addon-mcp). In your Storybook project run `npx storybook add @storybook/addon-mcp`, start the Storybook dev server, then enable this listing to connect at http://127.0.0.1:6006/mcp (adjust port if needed). Community: review before enabling.\",\n      \"trustTier\": \"community\",\n      \"version\": \"10.6.5\",\n      \"homepage\": \"https://storybook.js.org/docs/ai/mcp/overview\",\n      \"requiresAuth\": false,\n      \"transport\": \"http\",\n      \"url\": \"http://127.0.0.1:6006/mcp\"\n    }\n  ]\n}\n";

const EMBEDDED_CATALOG_SIGNATURE =
  "N308pkLK8dldOmLjkZG9F2C2izlTfczkEh+oUjTgc4PSC+vMAHGXxtQdWW5hJfl4s0n/3nGuWa7J9fBDoA0WBg==";

const EMBEDDED_CATALOG_PUBLIC_KEY =
  "MCowBQYDK2VwAyEAhdkkwIPr1lUiQ3qDsgbyT9EhijRn0Gdxltw4YbV4l64=";

export function readBundledCatalogBody(): string {
  return readFromSourceTree("catalog.json") ?? EMBEDDED_CATALOG_BODY;
}

export function readBundledCatalogSignature(): string {
  return (readFromSourceTree("catalog.json.sig") ?? EMBEDDED_CATALOG_SIGNATURE).trim();
}

export function readBundledCatalogPublicKey(): string {
  return (readFromSourceTree("catalog.pubkey.b64") ?? EMBEDDED_CATALOG_PUBLIC_KEY).trim();
}
