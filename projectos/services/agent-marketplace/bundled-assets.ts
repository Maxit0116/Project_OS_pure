import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const bundledDir = join(here, "bundled");

const EMBEDDED_CATALOG_BODY = "{\n  \"version\": \"1\",\n  \"generatedAt\": \"2026-11-04T17:53:12.576Z\",\n  \"listings\": [\n    {\n      \"id\": \"curated.code-reviewer\",\n      \"name\": \"Code Reviewer\",\n      \"description\": \"Specialized agent that reviews diffs for correctness, regressions, and clarity before merge.\",\n      \"trustTier\": \"curated\",\n      \"version\": \"1.0.0\",\n      \"roleLabel\": \"Reviewer\",\n      \"instructions\": \"You are a careful code reviewer for this repository.\\n- Prefer concrete findings over praise.\\n- Call out missing tests, risky edge cases, and API contract breaks.\\n- Do not rewrite large areas unless the user asks; suggest focused fixes.\\n- Respect project rules and existing style.\\n\",\n      \"skillIds\": [],\n      \"dependsOn\": {\n        \"skills\": []\n      },\n      \"permissionNotes\": \"Read-only review preferred; request write only for suggested patches.\"\n    },\n    {\n      \"id\": \"community.prompt-engineer\",\n      \"name\": \"Prompt Engineer\",\n      \"description\": \"Community agent that helps author clearer agent prompts and skill briefs. Review before use.\",\n      \"trustTier\": \"community\",\n      \"version\": \"0.1.0\",\n      \"roleLabel\": \"Prompting\",\n      \"instructions\": \"Help the user write precise agent instructions and skill markdown.\\n- Ask clarifying questions when goals are vague.\\n- Prefer short, testable instructions over verbose essays.\\n- Never invent repository facts; ask to inspect files when needed.\\n\",\n      \"skillIds\": []\n    }\n  ]\n}\n";

const EMBEDDED_CATALOG_SIGNATURE = "tJY1ljzVNm7NQkLh2BPtpi+lYsq/jHVakqayc3Of3jl01vtLgxRng71ydiyIchVEiKlwxrXXrrKXrXdcU03yBg==";

const EMBEDDED_CATALOG_PUBLIC_KEY = "MCowBQYDK2VwAyEADPIbcLyabnfqDRWMPSZiwK9mecu+G4apnJ92V0fJiPQ=";

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
