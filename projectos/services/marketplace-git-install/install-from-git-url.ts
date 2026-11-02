import type {
  InstallFromGitUrlInput,
  InstallFromGitUrlResult,
} from "../../contracts/marketplace-git-install.js";
import type { McpServerConfig } from "../../contracts/settings.js";
import type { ProjectOSSettings } from "../../contracts/settings.js";
import {
  installProjectSkill,
  safeSkillInstallId,
  skillExists,
} from "../skill-catalog-service.js";
import { listingToMcpServerConfig } from "../mcp-catalog/install.js";
import { GithubContentsClient } from "./github-contents.js";
import {
  MarketplaceGitUrlError,
  parseMarketplaceGitUrl,
} from "./parse-git-url.js";
import { resolveMcpFromGithub } from "./resolve-mcp.js";
import { resolveSkillFromGithub } from "./resolve-skill.js";

export type InstallFromGitUrlDeps = {
  workspaceRoot: string;
  settings: ProjectOSSettings;
  accessToken?: string;
  /** Persist an MCP server config (same path as catalog install). */
  saveMcpServer: (input: {
    config: McpServerConfig;
  }) => Promise<ProjectOSSettings>;
  fetchImpl?: typeof fetch;
};

function failed(
  kind: InstallFromGitUrlInput["kind"],
  message: string,
): InstallFromGitUrlResult {
  return {
    status: "failed",
    kind,
    message,
    agentFallbackSuggested: true,
  };
}

function findMcpConflict(
  settings: ProjectOSSettings,
  listingId: string,
  name: string,
  gitUrl: string,
): { id: string; name: string } | null {
  for (const server of settings.mcpServers ?? []) {
    if (server.provenance?.listingId === listingId) {
      return { id: server.id, name: server.name };
    }
    if (server.provenance?.gitUrl === gitUrl) {
      return { id: server.id, name: server.name };
    }
    if (server.name.trim().toLowerCase() === name.trim().toLowerCase()) {
      return { id: server.id, name: server.name };
    }
  }
  return null;
}

/**
 * Deterministic install-from-git-URL for marketplace.
 * Non-GitHub hosts are not supported in v1 (agent fallback suggested).
 */
export async function installFromGitUrl(
  input: InstallFromGitUrlInput,
  deps: InstallFromGitUrlDeps,
): Promise<InstallFromGitUrlResult> {
  const kind = input.kind;
  let parsed;
  try {
    parsed = parseMarketplaceGitUrl(input.url);
  } catch (error) {
    return failed(
      kind,
      error instanceof Error ? error.message : "Invalid repository URL",
    );
  }

  if (!parsed.isGithub) {
    return failed(
      kind,
      "Only github.com URLs are supported by the automatic installer. Use agent install for other git hosts.",
    );
  }

  const client = new GithubContentsClient({
    ...(deps.accessToken ? { accessToken: deps.accessToken } : {}),
    ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
  });

  try {
    if (kind === "skills") {
      const resolved = await resolveSkillFromGithub({ parsed, client });
      const installId = safeSkillInstallId(resolved.listing.id);
      if (skillExists(deps.workspaceRoot, installId) && input.replace !== true) {
        return {
          status: "conflict",
          kind: "skills",
          existingId: installId,
          existingName: resolved.listing.name,
          message: `Skill '${resolved.listing.name}' is already installed.`,
        };
      }
      const skill = installProjectSkill({
        workspaceRoot: deps.workspaceRoot,
        listing: resolved.listing,
        replace: input.replace === true,
      });
      return {
        status: "installed",
        kind: "skills",
        skill,
        sourceUrl: parsed.httpsUrl.replace(/\.git$/u, ""),
      };
    }

    const resolved = await resolveMcpFromGithub({ parsed, client });
    const sourceUrl = parsed.httpsUrl.replace(/\.git$/u, "");
    const conflict = findMcpConflict(
      deps.settings,
      resolved.listing.id,
      resolved.listing.name,
      sourceUrl,
    );
    if (conflict && input.replace !== true) {
      return {
        status: "conflict",
        kind: "mcp",
        existingId: conflict.id,
        existingName: conflict.name,
        message: `MCP '${conflict.name}' is already installed.`,
      };
    }

    const config = listingToMcpServerConfig({
      listing: resolved.listing,
      catalogVersion: "git-url",
      ...(conflict && input.replace === true ? { serverId: conflict.id } : {}),
    });
    const withGitProvenance: McpServerConfig = {
      ...config,
      enabled: false,
      provenance: {
        ...config.provenance!,
        source: "git-url",
        gitUrl: sourceUrl,
        gitCommit: resolved.commitRef.slice(0, 64),
        trustTier: "community",
      },
    };

    const settings = await deps.saveMcpServer({ config: withGitProvenance });
    return {
      status: "installed",
      kind: "mcp",
      settings,
      serverId: withGitProvenance.id,
      sourceUrl,
    };
  } catch (error) {
    const message =
      error instanceof MarketplaceGitUrlError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Install from git URL failed";
    return failed(kind, message);
  }
}
