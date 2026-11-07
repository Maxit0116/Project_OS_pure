#!/usr/bin/env node
/**
 * Rebuild signed bundled stencil catalog + embed constants.
 *
 * Usage:
 *   node projectos/services/stencil-marketplace/scripts/rebuild-bundled-catalog.mjs
 */

import { generateKeyPairSync, sign } from "node:crypto";
import { writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const catalogRoot = resolve(__dirname, "..");
const bundledDir = join(catalogRoot, "bundled");
const assetsPath = join(catalogRoot, "bundled-assets.ts");

const listings = [
  {
    id: "curated.status-pill",
    name: "Status Pill",
    description:
      "Compact status / badge chip for dashboards and tables. Brief prefers existing Badge primitives.",
    trustTier: "curated",
    version: "1.0.0",
    stencils: [
      {
        id: "mkt-status-pill",
        category: "base",
        title: "Status pill",
        tags: ["badge", "status", "table"],
        description: "Compact colored status chip (success / warn / danger)",
        previewAsset: "stencils/previews/mkt-status-pill.png",
        motionAttachable: true,
        briefTemplate:
          "Add a Status pill / Badge. Label: {{label}}. Tone: {{variant}}. " +
          "Prefer the project's Badge / Tag primitive; otherwise install via shadcn badge. " +
          "Keep height compact for table cells; ensure contrast for the tone.",
        codegen: {
          strategy: "shadcn",
          packageHints: ["npx shadcn@latest add badge"],
          targetFilesHint: "components/ui/badge",
        },
        licenseNote: "MIT-oriented brief; no third-party asset embedded.",
      },
    ],
  },
  {
    id: "community.empty-state",
    name: "Empty State Panel",
    description:
      "Community empty-state composition (icon + title + CTA). Review brief before installing — content enters agent input.",
    trustTier: "community",
    version: "0.1.0",
    stencils: [
      {
        id: "mkt-empty-state",
        category: "preset",
        title: "Empty state",
        tags: ["empty", "onboarding", "cta"],
        description: "Centered empty-state with title, body, and primary CTA",
        previewAsset: "stencils/previews/mkt-empty-state.png",
        composedOf: [],
        briefTemplate:
          "Add an Empty State panel. Title: {{title}}. Body: {{text}}. CTA label: {{label}}. " +
          "Center vertically in the available region. Prefer existing Empty / Illustration patterns; " +
          "otherwise compose Card + Button. Keep copy concise.",
        codegen: {
          strategy: "brief-only",
          targetFilesHint: "empty state section",
        },
        licenseNote: "Community pack — review before shipping to customers.",
      },
    ],
  },
];

function writeBundledAssets({ body, signatureBase64, publicKeySpkiBase64 }) {
  const source = `import { readFileSync } from "node:fs";
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

export function readBundledStencilCatalogBody(): string {
  return tryRead(join(bundledDir, "catalog.json")) ?? EMBEDDED_CATALOG_BODY;
}

export function readBundledStencilCatalogSignature(): string {
  return (
    tryRead(join(bundledDir, "catalog.json.sig"))?.trim() ??
    EMBEDDED_CATALOG_SIGNATURE
  );
}

export function readBundledStencilCatalogPublicKey(): string {
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
    console.log(`  - ${listing.id} (${listing.trustTier})`);
  }
  console.log(`Updated embed constants → ${assetsPath}`);
}

main();
