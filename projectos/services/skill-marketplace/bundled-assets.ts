/**
 * Bundled skill catalog assets.
 *
 * electron-vite packs services into `desktop/out/main/index.js` and does not copy
 * `bundled/` next to that chunk. Runtime `readFileSync(import.meta.url/…)` therefore
 * throws ENOENT during `getProjectOsService()` and blocks app startup.
 *
 * Prefer on-disk `bundled/` when present (vitest / source tree); otherwise use
 * embedded constants that match those files.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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

const EMBEDDED_CATALOG_BODY = "{\n  \"version\": \"1\",\n  \"generatedAt\": \"2026-10-29T00:00:00.000Z\",\n  \"listings\": [\n    {\n      \"id\": \"curated.ask-mode\",\n      \"name\": \"Ask Mode\",\n      \"description\": \"Switch the chat composer to Ask mode for read-only grounded Q&A.\",\n      \"trustTier\": \"curated\",\n      \"version\": \"1.0.0\",\n      \"skillMarkdown\": \"---\\nname: ask-mode\\ndescription: Switch the chat composer to Ask mode for read-only grounded Q&A.\\ndisable-model-invocation: true\\n---\\n\\n# Ask Mode\\n\\nSwitch the user to **Ask** mode. Do not propose diffs or file edits.\\n\"\n    },\n    {\n      \"id\": \"community.create-skill\",\n      \"name\": \"Create Skill\",\n      \"description\": \"Community-tier helper for authoring a new skill. Review before enabling.\",\n      \"trustTier\": \"community\",\n      \"version\": \"0.1.0\",\n      \"skillMarkdown\": \"---\\nname: create-skill\\ndescription: Guides the user through creating a new Project OS skill under .projectos/skills/.\\ndisable-model-invocation: true\\n---\\n\\n# Create Skill\\n\\n1. Ask what workflow the skill should encode.\\n2. Create `.projectos/skills/<skill-name>/SKILL.md` with YAML frontmatter (`name`, `description`).\\n3. Keep the body under 500 lines and link detailed references in sibling files.\\n\"\n    }\n  ]\n}\n";

const EMBEDDED_CATALOG_SIGNATURE = "iRZyzGGDn+TWtUxs7Jq3wwso/Hxbhd9T5hHYlr6FeUw10gOWwhVabT79RRJ7sH5bce7SEsal+ekUJuFIH6iVCA==";

const EMBEDDED_CATALOG_PUBLIC_KEY = "MCowBQYDK2VwAyEAoM6NmXRDAjgQ7s8T8PUNGdpRFZin5+aztSM831KB9vY=";

export function readBundledSkillCatalogBody(): string {
  return readFromSourceTree("catalog.json") ?? EMBEDDED_CATALOG_BODY;
}

export function readBundledSkillCatalogSignature(): string {
  return (
    readFromSourceTree("catalog.json.sig") ?? EMBEDDED_CATALOG_SIGNATURE
  ).trim();
}

export function readBundledSkillCatalogPublicKey(): string {
  return (
    readFromSourceTree("catalog.pubkey.b64") ?? EMBEDDED_CATALOG_PUBLIC_KEY
  ).trim();
}
