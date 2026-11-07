import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const bundledDir = join(here, "bundled");

const EMBEDDED_CATALOG_BODY = "{\n  \"version\": \"1\",\n  \"generatedAt\": \"2026-11-04T18:26:56.117Z\",\n  \"listings\": [\n    {\n      \"id\": \"curated.status-pill\",\n      \"name\": \"Status Pill\",\n      \"description\": \"Compact status / badge chip for dashboards and tables. Brief prefers existing Badge primitives.\",\n      \"trustTier\": \"curated\",\n      \"version\": \"1.0.0\",\n      \"stencils\": [\n        {\n          \"id\": \"mkt-status-pill\",\n          \"category\": \"base\",\n          \"title\": \"Status pill\",\n          \"tags\": [\n            \"badge\",\n            \"status\",\n            \"table\"\n          ],\n          \"description\": \"Compact colored status chip (success / warn / danger)\",\n          \"previewAsset\": \"stencils/previews/mkt-status-pill.png\",\n          \"motionAttachable\": true,\n          \"briefTemplate\": \"Add a Status pill / Badge. Label: {{label}}. Tone: {{variant}}. Prefer the project's Badge / Tag primitive; otherwise install via shadcn badge. Keep height compact for table cells; ensure contrast for the tone.\",\n          \"codegen\": {\n            \"strategy\": \"shadcn\",\n            \"packageHints\": [\n              \"npx shadcn@latest add badge\"\n            ],\n            \"targetFilesHint\": \"components/ui/badge\"\n          },\n          \"licenseNote\": \"MIT-oriented brief; no third-party asset embedded.\"\n        }\n      ]\n    },\n    {\n      \"id\": \"community.empty-state\",\n      \"name\": \"Empty State Panel\",\n      \"description\": \"Community empty-state composition (icon + title + CTA). Review brief before installing — content enters agent input.\",\n      \"trustTier\": \"community\",\n      \"version\": \"0.1.0\",\n      \"stencils\": [\n        {\n          \"id\": \"mkt-empty-state\",\n          \"category\": \"preset\",\n          \"title\": \"Empty state\",\n          \"tags\": [\n            \"empty\",\n            \"onboarding\",\n            \"cta\"\n          ],\n          \"description\": \"Centered empty-state with title, body, and primary CTA\",\n          \"previewAsset\": \"stencils/previews/mkt-empty-state.png\",\n          \"composedOf\": [],\n          \"briefTemplate\": \"Add an Empty State panel. Title: {{title}}. Body: {{text}}. CTA label: {{label}}. Center vertically in the available region. Prefer existing Empty / Illustration patterns; otherwise compose Card + Button. Keep copy concise.\",\n          \"codegen\": {\n            \"strategy\": \"brief-only\",\n            \"targetFilesHint\": \"empty state section\"\n          },\n          \"licenseNote\": \"Community pack — review before shipping to customers.\"\n        }\n      ]\n    }\n  ]\n}\n";

const EMBEDDED_CATALOG_SIGNATURE = "hYSfqAfDbW6wl/HVDV5qMK+C/z16QdubWZnVTsZQg8BCvdf4tSohkmVvrIZ1f6lE/dEV7ovg93Teq5cb7UI2AA==";

const EMBEDDED_CATALOG_PUBLIC_KEY = "MCowBQYDK2VwAyEAYf5tLg6e8Q0LB1lhm9MjZRaQmLfUMxAwNz72w4EP4Rk=";

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
