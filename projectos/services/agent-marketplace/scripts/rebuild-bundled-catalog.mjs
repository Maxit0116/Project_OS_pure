#!/usr/bin/env node
/**
 * Rebuild signed bundled Agent (talent library) catalog + embed constants.
 *
 * Usage:
 *   node projectos/services/agent-marketplace/scripts/rebuild-bundled-catalog.mjs
 *
 * Writes:
 *   - bundled/catalog.json
 *   - bundled/catalog.json.sig
 *   - bundled/catalog.pubkey.b64
 *   - bundled-assets.ts (EMBEDDED_* constants)
 */

import { generateKeyPairSync, sign } from "node:crypto";
import { writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { TALENT_LIBRARY_LISTINGS } from "./talent-library-listings.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const catalogRoot = resolve(__dirname, "..");
const bundledDir = join(catalogRoot, "bundled");
const assetsPath = join(catalogRoot, "bundled-assets.ts");

function writeBundledAssets({ body, signatureBase64, publicKeySpkiBase64 }) {
  const source = `/**
 * Bundled Agent (talent library) catalog assets.
 *
 * These must be string constants (not runtime \`readFileSync\` beside \`import.meta.url\`):
 * electron-vite packs services into \`desktop/out/main/index.js\` and does not copy the
 * \`bundled/\` directory next to that chunk.
 *
 * Keep \`bundled/catalog.json\` (+ \`.sig\` / \`.pubkey.b64\`) as the editable source of truth;
 * regenerate with:
 *   node projectos/services/agent-marketplace/scripts/rebuild-bundled-catalog.mjs
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const bundledDir = join(here, "bundled");

const EMBEDDED_CATALOG_BODY = ${JSON.stringify(body)};

const EMBEDDED_CATALOG_SIGNATURE = ${JSON.stringify(signatureBase64)};

const EMBEDDED_CATALOG_PUBLIC_KEY = ${JSON.stringify(publicKeySpkiBase64)};

function tryRead(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

export function readBundledAgentCatalogBody(): string {
  return tryRead(join(bundledDir, "catalog.json")) ?? EMBEDDED_CATALOG_BODY;
}

export function readBundledAgentCatalogSignature(): string {
  return (
    tryRead(join(bundledDir, "catalog.json.sig"))?.trim() ??
    EMBEDDED_CATALOG_SIGNATURE
  );
}

export function readBundledAgentCatalogPublicKey(): string {
  return (
    tryRead(join(bundledDir, "catalog.pubkey.b64"))?.trim() ??
    EMBEDDED_CATALOG_PUBLIC_KEY
  );
}
`;
  writeFileSync(assetsPath, source, "utf8");
}

function main() {
  const document = {
    version: "2",
    generatedAt: new Date().toISOString(),
    listings: TALENT_LIBRARY_LISTINGS,
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
  for (const listing of TALENT_LIBRARY_LISTINGS) {
    console.log(
      `  - ${listing.id} (${listing.trustTier}, ${listing.department ?? "n/a"})`,
    );
  }
  console.log(`Updated embed constants → ${assetsPath}`);
}

main();
