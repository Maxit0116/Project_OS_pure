import type { McpCatalogListing } from "../../contracts/mcp-catalog.js";
import type { GithubContentsClient } from "./github-contents.js";
import type { ParsedMarketplaceGitUrl } from "./parse-git-url.js";
import { MarketplaceGitUrlError } from "./parse-git-url.js";

export type ResolvedGitMcp = {
  listing: McpCatalogListing;
  commitRef: string;
};

type PackageJson = {
  name?: string;
  description?: string;
  version?: string;
  bin?: string | Record<string, string>;
};

function listingIdFor(parsed: ParsedMarketplaceGitUrl, packageName?: string): string {
  const slug = (packageName ?? `${parsed.owner}-${parsed.repo}`)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 80);
  return `git.${slug || "mcp"}`.slice(0, 120);
}

function tryParseMcpJson(raw: string): McpCatalogListing | null {
  try {
    const parsed = JSON.parse(raw) as {
      mcpServers?: Record<
        string,
        {
          command?: string;
          args?: string[];
          env?: Record<string, string>;
          url?: string;
          headers?: Record<string, string>;
        }
      >;
    };
    const entries = Object.entries(parsed.mcpServers ?? {});
    if (entries.length === 0) return null;
    const [name, config] = entries[0]!;
    if (config.url?.trim()) {
      return {
        id: listingIdForFake(name),
        name,
        trustTier: "community",
        version: "git",
        requiresAuth: false,
        transport: "http",
        url: config.url.trim(),
        ...(config.headers ? { headers: config.headers } : {}),
      };
    }
    if (config.command?.trim()) {
      return {
        id: listingIdForFake(name),
        name,
        trustTier: "community",
        version: "git",
        requiresAuth: false,
        transport: "stdio",
        command: config.command.trim(),
        ...(config.args?.length ? { args: config.args } : {}),
        ...(config.env ? { env: config.env } : {}),
      };
    }
  } catch {
    // ignore
  }
  return null;
}

function listingIdForFake(name: string): string {
  return `git.${name}`
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 120);
}

/** Extract first ```json ... mcpServers ... ``` block from README. */
function tryParseReadmeMcpBlock(readme: string): McpCatalogListing | null {
  const fence = /```(?:json|jsonc)?\s*([\s\S]*?)```/giu;
  let match: RegExpExecArray | null;
  while ((match = fence.exec(readme)) !== null) {
    const body = match[1] ?? "";
    if (!body.includes("mcpServers")) continue;
    const listing = tryParseMcpJson(body);
    if (listing) return listing;
  }
  return null;
}

function fromPackageJson(
  pkg: PackageJson,
  parsed: ParsedMarketplaceGitUrl,
  ref: string,
): McpCatalogListing | null {
  const packageName = pkg.name?.trim();
  if (!packageName) return null;
  const displayName =
    packageName.replace(/^@[^/]+\//u, "").replace(/[-_]/gu, " ") || parsed.repo;
  return {
    id: listingIdFor(parsed, packageName),
    name: displayName,
    description: pkg.description?.trim() || `MCP from ${packageName}`,
    trustTier: "community",
    version: (pkg.version ?? ref).slice(0, 64),
    homepage: `https://${parsed.host}/${parsed.owner}/${parsed.repo}`,
    requiresAuth: false,
    transport: "stdio",
    command: "npx",
    args: ["-y", packageName],
  };
}

export async function resolveMcpFromGithub(input: {
  parsed: ParsedMarketplaceGitUrl;
  client: GithubContentsClient;
}): Promise<ResolvedGitMcp> {
  const { parsed, client } = input;
  const ref = parsed.ref ?? (await client.getDefaultBranch(parsed));
  const base = parsed.subpath?.replace(/\/SKILL\.md$/iu, "").replace(/\/+$/u, "") ?? "";

  const candidateFiles = [
    base ? `${base}/mcp.json` : "mcp.json",
    base ? `${base}/.cursor/mcp.json` : ".cursor/mcp.json",
    base ? `${base}/package.json` : "package.json",
    base ? `${base}/README.md` : "README.md",
    "README.md",
  ];

  let packageListing: McpCatalogListing | null = null;
  let configListing: McpCatalogListing | null = null;
  let readmeListing: McpCatalogListing | null = null;

  for (const path of [...new Set(candidateFiles)]) {
    const file = await client.getFile(parsed, path, ref);
    if (!file) continue;
    if (path.endsWith("mcp.json")) {
      configListing = tryParseMcpJson(file.content) ?? configListing;
    } else if (path.endsWith("package.json")) {
      try {
        const pkg = JSON.parse(file.content) as PackageJson;
        packageListing = fromPackageJson(pkg, parsed, ref);
      } catch {
        // ignore invalid package.json
      }
    } else if (path.toLowerCase().endsWith("readme.md")) {
      readmeListing = tryParseReadmeMcpBlock(file.content) ?? readmeListing;
    }
  }

  const listing = configListing ?? readmeListing ?? packageListing;
  if (!listing) {
    throw new MarketplaceGitUrlError(
      "Could not infer an MCP install config. Expected mcp.json, a README mcpServers block, or a package.json name for npx.",
    );
  }

  // Stamp stable git-based id / community trust / homepage.
  const stamped: McpCatalogListing = {
    ...listing,
    id: listingIdFor(parsed, listing.id),
    trustTier: "community",
    homepage:
      listing.homepage ??
      `https://${parsed.host}/${parsed.owner}/${parsed.repo}`,
    version: listing.version || ref.slice(0, 32),
  };

  return { listing: stamped, commitRef: ref };
}
