import type { SkillCatalogListing } from "../../contracts/skill-marketplace.js";
import type { GithubContentsClient } from "./github-contents.js";
import type { ParsedMarketplaceGitUrl } from "./parse-git-url.js";
import { MarketplaceGitUrlError } from "./parse-git-url.js";
import { safeSkillInstallId } from "../skill-catalog-service.js";

const SKILL_FILE = "SKILL.md";

const PREFERRED_SKILL_DIRS = [
  "",
  ".projectos/skills",
  ".cursor/skills",
  "skills",
  "skill",
];

function parseFrontmatterName(raw: string): { name?: string; description?: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/u.exec(raw);
  if (!match) return {};
  let name: string | undefined;
  let description: string | undefined;
  for (const line of (match[1] ?? "").split("\n")) {
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).trim();
    if (key === "name" && value) name = value.replace(/^["']|["']$/gu, "");
    if (key === "description" && value) {
      description = value.replace(/^["']|["']$/gu, "");
    }
  }
  return { ...(name ? { name } : {}), ...(description ? { description } : {}) };
}

function pickSkillPaths(allPaths: string[], subpath?: string): string[] {
  const skillFiles = allPaths.filter(
    (p) => p === SKILL_FILE || p.endsWith(`/${SKILL_FILE}`),
  );
  if (subpath) {
    const normalized = subpath.replace(/^\/+|\/+$/gu, "");
    if (normalized.endsWith(SKILL_FILE)) {
      return skillFiles.filter((p) => p === normalized);
    }
    return skillFiles.filter(
      (p) => p === `${normalized}/${SKILL_FILE}` || p.startsWith(`${normalized}/`),
    );
  }

  for (const dir of PREFERRED_SKILL_DIRS) {
    const matches = skillFiles.filter((p) =>
      dir ? p.startsWith(`${dir}/`) && p.split("/").length === dir.split("/").length + 2
        : p === SKILL_FILE,
    );
    if (matches.length > 0) return matches;
  }
  return skillFiles;
}

export type ResolvedGitSkill = {
  listing: SkillCatalogListing;
  commitRef: string;
  skillPath: string;
};

export async function resolveSkillFromGithub(input: {
  parsed: ParsedMarketplaceGitUrl;
  client: GithubContentsClient;
}): Promise<ResolvedGitSkill> {
  const { parsed, client } = input;
  const ref = parsed.ref ?? (await client.getDefaultBranch(parsed));

  let skillPath: string | undefined;

  if (parsed.subpath?.endsWith(SKILL_FILE)) {
    skillPath = parsed.subpath.replace(/^\/+/u, "");
  } else {
    const tree = await client.listRecursivePaths(parsed, ref);
    const candidates = pickSkillPaths(tree, parsed.subpath);
    if (candidates.length === 0) {
      throw new MarketplaceGitUrlError(
        "No SKILL.md found in this repository. Point the URL at a skill folder or SKILL.md file.",
      );
    }
    if (candidates.length > 1) {
      // Prefer shallowest path; deterministic pick (agent can handle multi-skill repos).
      candidates.sort((a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b));
    }
    skillPath = candidates[0];
  }

  const file = await client.getFile(parsed, skillPath!, ref);
  if (!file) {
    throw new MarketplaceGitUrlError(`Could not read ${skillPath} from the repository`);
  }

  const meta = parseFrontmatterName(file.content);
  const folderName =
    skillPath!.includes("/")
      ? skillPath!.split("/").slice(-2, -1)[0]!
      : parsed.repo;
  const listingId = safeSkillInstallId(
    `git.${parsed.owner}.${parsed.repo}.${folderName}`,
  );
  const name = meta.name?.trim() || folderName || parsed.repo;
  const description =
    meta.description?.trim() ||
    `Installed from ${parsed.owner}/${parsed.repo}`;

  const listing: SkillCatalogListing = {
    id: listingId,
    name,
    description,
    trustTier: "community",
    version: ref.slice(0, 32),
    homepage: `https://${parsed.host}/${parsed.owner}/${parsed.repo}`,
    skillMarkdown: file.content,
  };

  return {
    listing,
    commitRef: ref,
    skillPath: skillPath!,
  };
}
