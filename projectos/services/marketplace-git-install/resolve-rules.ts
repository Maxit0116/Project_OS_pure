import type { RulesCatalogListing } from "../../contracts/rules-marketplace.js";
import { RulesCatalogListingSchema } from "../../contracts/rules-marketplace.js";
import { safeRulesInstallId } from "../rules-catalog-service.js";
import type { GithubContentsClient } from "./github-contents.js";
import type { ParsedMarketplaceGitUrl } from "./parse-git-url.js";
import { MarketplaceGitUrlError } from "./parse-git-url.js";
import {
  parseCapabilityPackJson,
  type CapabilityPackEnvelope,
} from "./resolve-capability-pack.js";

const MAX_MD_FILES = 40;
const MAX_MD_DEPTH = 6;
const MAX_FILE_CHARS = 200_000;

const PACK_CANDIDATES = [
  ".projectos-pack.json",
  "capability-pack.json",
  "rules-pack.json",
];

export type ResolvedGitRules = {
  listing: RulesCatalogListing;
  commitRef: string;
  packPath?: string;
};

function pickMdFiles(allPaths: string[], subpath?: string): string[] {
  const normalized = subpath?.replace(/^\/+|\/+$/gu, "");
  let md = allPaths.filter((p) => /\.md$/iu.test(p));
  if (normalized) {
    if (normalized.endsWith(".md")) {
      md = md.filter((p) => p === normalized);
    } else {
      md = md.filter(
        (p) => p === normalized || p.startsWith(`${normalized}/`),
      );
    }
  } else {
    // Prefer rules/ or .projectos/rules/ when present
    const preferred = md.filter(
      (p) =>
        p.startsWith("rules/") ||
        p.startsWith(".projectos/rules/") ||
        p.startsWith(".cursor/rules/"),
    );
    if (preferred.length > 0) md = preferred;
  }

  md = md.filter((p) => {
    const depth = p.split("/").length;
    return depth <= MAX_MD_DEPTH;
  });
  md.sort((a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b));
  return md.slice(0, MAX_MD_FILES);
}

function listingFromPack(
  envelope: CapabilityPackEnvelope,
): RulesCatalogListing {
  if (envelope.kind !== "rules") {
    throw new MarketplaceGitUrlError(
      `Pack kind is '${envelope.kind}', expected 'rules'`,
    );
  }
  return RulesCatalogListingSchema.parse(envelope.listing);
}

function synthesizeListing(input: {
  idSeed: string;
  name: string;
  homepage: string;
  files: Record<string, string>;
}): RulesCatalogListing {
  const id = safeRulesInstallId(`git.${input.idSeed}`);
  return RulesCatalogListingSchema.parse({
    id,
    name: input.name.slice(0, 120),
    description: `Installed from ${input.homepage}`,
    trustTier: "community",
    version: "0.0.0-git",
    homepage: input.homepage,
    files: input.files,
  });
}

export async function resolveRulesFromGithub(input: {
  parsed: ParsedMarketplaceGitUrl;
  client: GithubContentsClient;
}): Promise<ResolvedGitRules> {
  const { parsed, client } = input;
  const ref = parsed.ref ?? (await client.getDefaultBranch(parsed));
  const sourceUrl = parsed.httpsUrl.replace(/\.git$/u, "");

  // Direct blob to a pack / md file
  if (parsed.subpath?.endsWith(".json")) {
    const file = await client.getFile(parsed, parsed.subpath, ref);
    if (!file) {
      throw new MarketplaceGitUrlError(`Could not read ${parsed.subpath}`);
    }
    const envelope = parseCapabilityPackJson(file.content);
    return {
      listing: listingFromPack(envelope),
      commitRef: file.sha ?? ref,
      packPath: parsed.subpath,
    };
  }

  if (parsed.subpath?.endsWith(".md")) {
    const file = await client.getFile(parsed, parsed.subpath, ref);
    if (!file) {
      throw new MarketplaceGitUrlError(`Could not read ${parsed.subpath}`);
    }
    const base = parsed.subpath.includes("/")
      ? parsed.subpath.split("/").pop()!
      : parsed.subpath;
    const files: Record<string, string> = {
      [base]: file.content.slice(0, MAX_FILE_CHARS),
    };
    return {
      listing: synthesizeListing({
        idSeed: `${parsed.owner}-${parsed.repo}-${base}`,
        name: `${parsed.repo}/${base}`,
        homepage: sourceUrl,
        files,
      }),
      commitRef: file.sha ?? ref,
    };
  }

  const tree = await client.listRecursivePaths(parsed, ref);

  // Prefer pack JSON at known names (root or under subpath)
  const packPaths = PACK_CANDIDATES.flatMap((name) => {
    if (parsed.subpath) {
      const base = parsed.subpath.replace(/^\/+|\/+$/gu, "");
      return [`${base}/${name}`, name];
    }
    return [name];
  });
  for (const packPath of packPaths) {
    if (!tree.includes(packPath) && packPath.includes("/")) continue;
    const file = await client.getFile(parsed, packPath, ref);
    if (!file) continue;
    try {
      const envelope = parseCapabilityPackJson(file.content);
      if (envelope.kind !== "rules") continue;
      return {
        listing: listingFromPack(envelope),
        commitRef: file.sha ?? ref,
        packPath,
      };
    } catch {
      // try next candidate
    }
  }

  // Also accept any *.projectos-pack.json under subpath
  const loosePacks = tree.filter((p) => {
    if (!p.endsWith(".projectos-pack.json") && p !== "capability-pack.json") {
      return false;
    }
    if (!parsed.subpath) return p.split("/").length <= 3;
    const base = parsed.subpath.replace(/^\/+|\/+$/gu, "");
    return p === base || p.startsWith(`${base}/`);
  });
  for (const packPath of loosePacks.slice(0, 5)) {
    const file = await client.getFile(parsed, packPath, ref);
    if (!file) continue;
    try {
      const envelope = parseCapabilityPackJson(file.content);
      if (envelope.kind !== "rules") continue;
      return {
        listing: listingFromPack(envelope),
        commitRef: file.sha ?? ref,
        packPath,
      };
    } catch {
      // continue
    }
  }

  const mdPaths = pickMdFiles(tree, parsed.subpath);
  if (mdPaths.length === 0) {
    throw new MarketplaceGitUrlError(
      "No rules pack JSON or markdown files found. Point the URL at a pack JSON or a rules folder.",
    );
  }

  const files: Record<string, string> = {};
  const prefix = parsed.subpath?.replace(/^\/+|\/+$/gu, "") ?? "";
  for (const path of mdPaths) {
    const file = await client.getFile(parsed, path, ref);
    if (!file) continue;
    let rel = path;
    if (prefix && path.startsWith(`${prefix}/`)) {
      rel = path.slice(prefix.length + 1);
    } else if (
      path.startsWith("rules/") ||
      path.startsWith(".projectos/rules/") ||
      path.startsWith(".cursor/rules/")
    ) {
      rel = path.split("/").slice(-1)[0]!;
      // Keep nested structure under rules/
      const parts = path.split("/");
      const rulesIdx = parts.findIndex((p) => p === "rules");
      if (rulesIdx >= 0 && rulesIdx < parts.length - 1) {
        rel = parts.slice(rulesIdx + 1).join("/");
      }
    }
    if (!rel || rel.includes("..")) continue;
    files[rel] = file.content.slice(0, MAX_FILE_CHARS);
  }

  if (Object.keys(files).length === 0) {
    throw new MarketplaceGitUrlError("Could not read any markdown rule files");
  }

  return {
    listing: synthesizeListing({
      idSeed: `${parsed.owner}-${parsed.repo}${prefix ? `-${prefix}` : ""}`,
      name: prefix ? `${parsed.repo}/${prefix}` : parsed.repo,
      homepage: sourceUrl,
      files,
    }),
    commitRef: ref,
  };
}
