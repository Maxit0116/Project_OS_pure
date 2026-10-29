#!/usr/bin/env node
/**
 * Rebuild signed bundled MCP catalog + embed constants.
 *
 * Usage:
 *   node projectos/services/mcp-catalog/scripts/rebuild-bundled-catalog.mjs
 *
 * Writes real-market MCP listings (npx / remote HTTP configs — no package download).
 * Signs with a fresh Ed25519 keypair and rewrites:
 *   - bundled/catalog.json
 *   - bundled/catalog.json.sig
 *   - bundled/catalog.pubkey.b64
 *   - bundled-assets.ts (EMBEDDED_* constants)
 */

import { generateKeyPairSync, sign } from "node:crypto";
import { writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const catalogRoot = resolve(__dirname, "..");
const bundledDir = join(catalogRoot, "bundled");
const assetsPath = join(catalogRoot, "bundled-assets.ts");

/**
 * Curated / community listings for marketplace one-click install.
 * Install writes disabled MCP server config; enable + connect runs `npx -y …`
 * (or HTTP) so the package is fetched then.
 */
const listings = [
  {
    id: "curated.playwright",
    name: "Playwright MCP",
    description:
      "Official Microsoft Playwright MCP — browser automation via accessibility snapshots (npx @playwright/mcp). Requires Node.js 18+.",
    trustTier: "curated",
    version: "0.0.83",
    homepage: "https://github.com/microsoft/playwright-mcp",
    requiresAuth: false,
    transport: "stdio",
    command: "npx",
    args: ["-y", "@playwright/mcp@latest"],
  },
  {
    id: "curated.chrome-devtools",
    name: "Chrome DevTools MCP",
    description:
      "Official Google Chrome DevTools MCP — control and inspect a live Chrome browser for automation, debugging, screenshots, and performance traces. Requires Node.js LTS and Chrome stable.",
    trustTier: "curated",
    version: "1.12.0",
    homepage: "https://github.com/ChromeDevTools/chrome-devtools-mcp",
    requiresAuth: false,
    transport: "stdio",
    command: "npx",
    args: ["-y", "chrome-devtools-mcp@latest"],
  },
  {
    id: "curated.context7",
    name: "Context7",
    description:
      "Upstash Context7 remote MCP — up-to-date, version-specific library docs and code examples (resolve-library-id, query-docs). Paste a Context7 API key at install for higher rate limits (context7.com/dashboard).",
    trustTier: "curated",
    version: "4.4.4",
    homepage: "https://context7.com",
    requiresAuth: true,
    transport: "http",
    url: "https://mcp.context7.com/mcp",
  },
  {
    id: "curated.filesystem",
    name: "Filesystem MCP",
    description:
      "Official Model Context Protocol filesystem server — read/write/search within allowed directories. Default allow-list is the workspace root (`.`). Edit args after install to add more absolute paths.",
    trustTier: "curated",
    version: "2.1.0",
    homepage: "https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem",
    requiresAuth: false,
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem@latest", "."],
  },
  {
    id: "community.storybook-mcp",
    name: "Storybook MCP Addon",
    description:
      "Storybook official MCP addon (@storybook/addon-mcp). In your Storybook project run `npx storybook add @storybook/addon-mcp`, start the Storybook dev server, then enable this listing to connect at http://127.0.0.1:6006/mcp (adjust port if needed). Community: review before enabling.",
    trustTier: "community",
    version: "10.6.5",
    homepage: "https://storybook.js.org/docs/ai/mcp/overview",
    requiresAuth: false,
    transport: "http",
    url: "http://127.0.0.1:6006/mcp",
  },
];

function writeBundledAssets({ body, signatureBase64, publicKeySpkiBase64 }) {
  const source = `/**
 * Bundled MCP catalog assets.
 *
 * These must be string constants (not runtime \`readFileSync\` beside \`import.meta.url\`):
 * electron-vite packs services into \`desktop/out/main/index.js\` and does not copy the
 * \`bundled/\` directory next to that chunk. Reading from disk there throws ENOENT on the
 * first \`getProjectOsService()\` call — which blocks \`openWorkspace\`.
 *
 * Keep \`bundled/catalog.json\` (+ \`.sig\` / \`.pubkey.b64\`) as the editable source of truth;
 * when regenerating signatures, update the constants below to match
 * (\`node projectos/services/mcp-catalog/scripts/rebuild-bundled-catalog.mjs\`).
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

const EMBEDDED_CATALOG_BODY = ${JSON.stringify(body)};

const EMBEDDED_CATALOG_SIGNATURE =
  ${JSON.stringify(signatureBase64)};

const EMBEDDED_CATALOG_PUBLIC_KEY =
  ${JSON.stringify(publicKeySpkiBase64)};

export function readBundledCatalogBody(): string {
  return readFromSourceTree("catalog.json") ?? EMBEDDED_CATALOG_BODY;
}

export function readBundledCatalogSignature(): string {
  return (readFromSourceTree("catalog.json.sig") ?? EMBEDDED_CATALOG_SIGNATURE).trim();
}

export function readBundledCatalogPublicKey(): string {
  return (readFromSourceTree("catalog.pubkey.b64") ?? EMBEDDED_CATALOG_PUBLIC_KEY).trim();
}
`;
  writeFileSync(assetsPath, source, "utf8");
}

function main() {
  const document = {
    version: "1",
    generatedAt: new Date().toISOString(),
    listings,
  };
  const body = `${JSON.stringify(document, null, 2)}\n`;

  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicKeySpkiBase64 = publicKey
    .export({ type: "spki", format: "der" })
    .toString("base64");
  const signatureBase64 = sign(null, Buffer.from(body, "utf8"), privateKey).toString(
    "base64",
  );

  writeFileSync(join(bundledDir, "catalog.json"), body, "utf8");
  writeFileSync(join(bundledDir, "catalog.json.sig"), `${signatureBase64}\n`, "utf8");
  writeFileSync(
    join(bundledDir, "catalog.pubkey.b64"),
    `${publicKeySpkiBase64}\n`,
    "utf8",
  );
  writeBundledAssets({ body, signatureBase64, publicKeySpkiBase64 });

  console.log(
    `\nWrote ${document.listings.length} listings → ${join(bundledDir, "catalog.json")}`,
  );
  for (const listing of listings) {
    console.log(`  - ${listing.id} (${listing.trustTier}, ${listing.transport})`);
  }
  console.log(`Updated embed constants → ${assetsPath}`);
}

main();
