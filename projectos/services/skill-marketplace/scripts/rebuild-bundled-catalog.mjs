#!/usr/bin/env node
/**
 * Rebuild signed bundled skill catalog + embed constants.
 *
 * Usage:
 *   node projectos/services/skill-marketplace/scripts/rebuild-bundled-catalog.mjs
 *
 * Reads SKILL.md (or skill.md) from the source roots below, keeps curated
 * seed listings, signs with a fresh Ed25519 keypair, and rewrites:
 *   - bundled/catalog.json
 *   - bundled/catalog.json.sig
 *   - bundled/catalog.pubkey.b64
 *   - bundled-assets.ts (EMBEDDED_* constants)
 */

import { generateKeyPairSync, sign } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const marketplaceRoot = resolve(__dirname, "..");
const bundledDir = join(marketplaceRoot, "bundled");
const assetsPath = join(marketplaceRoot, "bundled-assets.ts");
const repoRoot = resolve(marketplaceRoot, "../../..");
const home = process.env.HOME || process.env.USERPROFILE || "";

const MAX_DESCRIPTION = 4_000;
const MAX_SKILL_MARKDOWN = 200_000;

const curatedSeed = [
  {
    id: "curated.ask-mode",
    name: "Ask Mode",
    description: "Switch the chat composer to Ask mode for read-only grounded Q&A.",
    trustTier: "curated",
    version: "1.0.0",
    skillMarkdown:
      "---\nname: ask-mode\ndescription: Switch the chat composer to Ask mode for read-only grounded Q&A.\ndisable-model-invocation: true\n---\n\n# Ask Mode\n\nSwitch the user to **Ask** mode. Do not propose diffs or file edits.\n",
  },
  {
    id: "community.create-skill",
    name: "Create Skill",
    description:
      "Community-tier helper for authoring a new skill. Review before enabling.",
    trustTier: "community",
    version: "0.1.0",
    skillMarkdown:
      "---\nname: create-skill\ndescription: Guides the user through creating a new Project OS skill under .projectos/skills/.\ndisable-model-invocation: true\n---\n\n# Create Skill\n\n1. Ask what workflow the skill should encode.\n2. Create `.projectos/skills/<skill-name>/SKILL.md` with YAML frontmatter (`name`, `description`).\n3. Keep the body under 500 lines and link detailed references in sibling files.\n",
  },
];

/** Community skills sourced from public GitHub skill repos. */
const communitySources = [
  {
    id: "community.karpathy-guidelines",
    name: "Karpathy Guidelines",
    version: "1.0.0",
    homepage: "https://github.com/multica-ai/andrej-karpathy-skills",
    roots: [
      "/tmp/skill-repos/andrej-karpathy-skills/skills/karpathy-guidelines",
      join(repoRoot, ".tmp-skill-repos/andrej-karpathy-skills/skills/karpathy-guidelines"),
    ],
  },
  {
    id: "community.ponytail",
    name: "Ponytail",
    version: "1.0.0",
    homepage: "https://github.com/DietrichGebert/ponytail",
    roots: [join(repoRoot, ".tmp-skill-repos/ponytail/skills/ponytail")],
  },
  {
    id: "community.ui-ux-pro-max",
    name: "UI/UX Pro Max",
    version: "1.0.0",
    homepage: "https://github.com/nextlevelbuilder/ui-ux-pro-max-skill",
    roots: [
      join(repoRoot, ".tmp-skill-repos/ui-ux-pro-max-skill"),
      home ? join(home, ".cursor/skills/ui-ux-pro-max") : "",
    ].filter(Boolean),
  },
  {
    id: "community.graphify",
    name: "Graphify",
    version: "1.0.0",
    homepage: "https://github.com/Graphify-Labs/graphify",
    roots: [
      join(repoRoot, ".tmp-skill-repos/graphify/skills/graphify"),
      join(repoRoot, ".tmp-skill-repos/graphify/graphify"),
    ],
  },
  {
    id: "community.caveman",
    name: "Caveman",
    version: "1.0.0",
    homepage: "https://github.com/JuliusBrussee/caveman",
    roots: ["/tmp/skill-repos/caveman/skills/caveman"],
  },
  {
    id: "community.taste-skill",
    name: "Taste Skill",
    version: "2.0.0",
    homepage: "https://github.com/Leonxlnx/taste-skill",
    roots: ["/tmp/skill-repos/taste-skill/skills/taste-skill"],
  },
  {
    id: "community.archify",
    name: "Archify",
    version: "2.16.0",
    homepage: "https://github.com/tt-a1i/archify",
    roots: [
      join(repoRoot, ".tmp-skill-repos/archify/archify"),
      home ? join(home, ".agents/skills/archify") : "",
    ].filter(Boolean),
  },
  {
    id: "community.impeccable",
    name: "Impeccable",
    version: "1.0.0",
    homepage: "https://github.com/pbakaus/impeccable",
    roots: [
      "/tmp/skill-repos/impeccable/.agents/skills/impeccable",
      "/tmp/skill-repos/impeccable/plugin/skills/impeccable",
    ],
  },
  {
    id: "community.last30days",
    name: "Last 30 Days",
    version: "1.0.0",
    homepage: "https://github.com/mvanhorn/last30days-skill",
    roots: [
      join(repoRoot, ".tmp-skill-repos/last30days-skill/skills/last30days"),
    ],
  },
  {
    id: "community.diagram-design",
    name: "Diagram Design",
    version: "2.6.0",
    homepage: "https://github.com/cathrynlavery/diagram-design",
    roots: ["/tmp/skill-repos/diagram-design/skills/diagram-design"],
  },
];

function readSkillMarkdown(roots) {
  for (const root of roots) {
    for (const name of ["SKILL.md", "skill.md"]) {
      const path = join(root, name);
      if (existsSync(path)) {
        return { path, markdown: readFileSync(path, "utf8") };
      }
    }
  }
  return null;
}

function parseFrontmatter(markdown) {
  if (!markdown.startsWith("---")) return {};
  const end = markdown.indexOf("\n---", 3);
  if (end < 0) return {};
  const fm = markdown.slice(3, end);
  const out = {};
  const name = fm.match(/^name:\s*["']?(.+?)["']?\s*$/m);
  if (name) out.name = name[1].trim();
  const descMatch = fm.match(
    /^description:\s*(?:>-?\s*)?([^\n]*(?:\n(?![a-zA-Z0-9_-]+:)[^\n]*)*)/m,
  );
  if (descMatch) {
    out.description = descMatch[1]
      .replace(/^["']|["']$/g, "")
      .replace(/\n/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
  const version = fm.match(/^\s*version:\s*["']?([^"'\n]+)["']?/m);
  if (version) out.version = version[1].trim();
  return out;
}

function clip(text, max) {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

function buildCommunityListings() {
  const listings = [];
  for (const src of communitySources) {
    const found = readSkillMarkdown(src.roots);
    if (!found) {
      throw new Error(
        `Missing SKILL.md for ${src.id}. Tried:\n${src.roots.join("\n")}`,
      );
    }
    if (found.markdown.length > MAX_SKILL_MARKDOWN) {
      throw new Error(
        `${src.id} SKILL.md is ${found.markdown.length} bytes (max ${MAX_SKILL_MARKDOWN})`,
      );
    }
    const fm = parseFrontmatter(found.markdown);
    const description = clip(
      fm.description ||
        `${src.name} community skill. Review before enabling. Full package: ${src.homepage}`,
      MAX_DESCRIPTION,
    );
    listings.push({
      id: src.id,
      name: src.name,
      description,
      trustTier: "community",
      version: src.version || fm.version || "0.1.0",
      homepage: src.homepage,
      skillMarkdown: found.markdown.endsWith("\n")
        ? found.markdown
        : `${found.markdown}\n`,
    });
    console.log(`+ ${src.id} from ${found.path} (${found.markdown.length} bytes)`);
  }
  return listings;
}

function writeBundledAssets({ body, signatureBase64, publicKeySpkiBase64 }) {
  const source = `/**
 * Bundled skill catalog assets.
 *
 * electron-vite packs services into \`desktop/out/main/index.js\` and does not copy
 * \`bundled/\` next to that chunk. Runtime \`readFileSync(import.meta.url/…)\` therefore
 * throws ENOENT during \`getProjectOsService()\` and blocks app startup.
 *
 * Prefer on-disk \`bundled/\` when present (vitest / source tree); otherwise use
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

const EMBEDDED_CATALOG_BODY = ${JSON.stringify(body)};

const EMBEDDED_CATALOG_SIGNATURE = ${JSON.stringify(signatureBase64)};

const EMBEDDED_CATALOG_PUBLIC_KEY = ${JSON.stringify(publicKeySpkiBase64)};

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
`;
  writeFileSync(assetsPath, source, "utf8");
}

function main() {
  const community = buildCommunityListings();
  const document = {
    version: "1",
    generatedAt: new Date().toISOString(),
    listings: [...curatedSeed, ...community],
  };
  // Pretty JSON with trailing newline — signature covers exact bytes.
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
  console.log(`Updated embed constants → ${assetsPath}`);
}

main();
