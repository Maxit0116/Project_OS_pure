import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const bundledDir = join(here, "bundled");

const EMBEDDED_CATALOG_BODY = "{\n  \"version\": \"1\",\n  \"generatedAt\": \"2026-11-04T17:23:31.863Z\",\n  \"listings\": [\n    {\n      \"id\": \"curated.typescript-strict\",\n      \"name\": \"TypeScript Strict\",\n      \"description\": \"Always-on project rules for strict TypeScript, explicit types at boundaries, and no casual any.\",\n      \"trustTier\": \"curated\",\n      \"version\": \"1.0.0\",\n      \"files\": {\n        \"typescript-strict.md\": \"---\\nactivation: always\\ndescription: Strict TypeScript defaults for agent edits\\n---\\n\\n# TypeScript Strict\\n\\n- Prefer `unknown` over `any` at API boundaries; narrow before use.\\n- Do not silence type errors with `@ts-ignore` / `@ts-expect-error` unless the user asks.\\n- Keep public function return types explicit when inference would hide a contract.\\n- Match existing module import style (ESM / path aliases) in this repo.\\n\"\n      }\n    },\n    {\n      \"id\": \"community.verbose-explanations\",\n      \"name\": \"Verbose Explanations\",\n      \"description\": \"Community pack that asks the agent to narrate steps heavily. Review before installing.\",\n      \"trustTier\": \"community\",\n      \"version\": \"0.1.0\",\n      \"files\": {\n        \"verbose.md\": \"---\\nactivation: always\\ndescription: Prefer longer step-by-step narration\\n---\\n\\n# Verbose Explanations\\n\\nWhen explaining changes, include rationale, alternatives considered, and residual risks.\\nKeep code edits minimal; do not expand scope for narration alone.\\n\"\n      }\n    }\n  ]\n}\n";

const EMBEDDED_CATALOG_SIGNATURE = "JbSRJaNuezIuZ4UVW7w60yK+Q+KddhYkUoMJZu6PmST0xGmEC1yH5aO6qSCSbIyKWbDKzWqa/O2HC36fztRlBA==";

const EMBEDDED_CATALOG_PUBLIC_KEY = "MCowBQYDK2VwAyEAJu/+96rNjrC7iehtocG7Da1zxNHvf+0EpkarC2Skal0=";

function tryRead(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

export function readBundledRulesCatalogBody(): string {
  return tryRead(join(bundledDir, "catalog.json")) ?? EMBEDDED_CATALOG_BODY;
}

export function readBundledRulesCatalogSignature(): string {
  return (
    tryRead(join(bundledDir, "catalog.json.sig"))?.trim() ??
    EMBEDDED_CATALOG_SIGNATURE
  );
}

export function readBundledRulesCatalogPublicKey(): string {
  return (
    tryRead(join(bundledDir, "catalog.pubkey.b64"))?.trim() ??
    EMBEDDED_CATALOG_PUBLIC_KEY
  );
}
