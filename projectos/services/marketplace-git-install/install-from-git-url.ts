import type {
  InstallFromGitUrlInput,
  InstallFromGitUrlResult,
  MarketplaceGitInstallKind,
} from "../../contracts/marketplace-git-install.js";
import type { McpServerConfig } from "../../contracts/settings.js";
import type { ProjectOSSettings } from "../../contracts/settings.js";
import { AgentCatalogListingSchema } from "../../contracts/agent-marketplace.js";
import { RulesCatalogListingSchema } from "../../contracts/rules-marketplace.js";
import { StencilCatalogListingSchema } from "../../contracts/stencil-marketplace.js";
import { WorkflowCatalogListingSchema } from "../../contracts/workflow-marketplace.js";
import {
  findMarketplaceAgentByListingId,
  installAgentFromListing,
  AgentInstallError,
} from "../agent-catalog-service.js";
import {
  installProjectSkill,
  safeSkillInstallId,
  skillExists,
} from "../skill-catalog-service.js";
import { listingToMcpServerConfig } from "../mcp-catalog/install.js";
import {
  installProjectRulesPack,
  rulesPackExists,
  RulesInstallError,
  safeRulesInstallId,
} from "../rules-catalog-service.js";
import {
  installWorkflowFromListing,
  listInstalledWorkflowListingIds,
  WorkflowInstallError,
} from "../workflow-catalog-service.js";
import {
  installStencilFromListing,
  listInstalledStencilListingIds,
  StencilInstallError,
} from "../stencil-catalog-service.js";
import { GithubContentsClient } from "./github-contents.js";
import {
  MarketplaceGitUrlError,
  parseMarketplaceGitUrl,
} from "./parse-git-url.js";
import { resolveMcpFromGithub } from "./resolve-mcp.js";
import { resolveSkillFromGithub } from "./resolve-skill.js";
import { resolveRulesFromGithub } from "./resolve-rules.js";
import {
  assertPackKindMatchesTab,
  type CapabilityPackEnvelope,
  resolveCapabilityPackFromGithub,
} from "./resolve-capability-pack.js";
import {
  fetchCapabilityPackFromHttpUrl,
  looksLikeHttpPackJsonUrl,
} from "./fetch-http-pack.js";

export type InstallFromGitUrlDeps = {
  workspaceRoot: string;
  /** Agent definitions root (usually workspace.projectOSRoot). */
  projectOSRoot: string;
  projectId?: string;
  settings: ProjectOSSettings;
  accessToken?: string;
  /** Persist an MCP server config (same path as catalog install). */
  saveMcpServer: (input: {
    config: McpServerConfig;
  }) => Promise<ProjectOSSettings>;
  fetchImpl?: typeof fetch;
};

function failed(
  kind: MarketplaceGitInstallKind,
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

function installEnvelope(
  envelope: CapabilityPackEnvelope,
  deps: InstallFromGitUrlDeps,
  input: InstallFromGitUrlInput,
  sourceUrl: string,
  commitRef?: string,
): InstallFromGitUrlResult {
  const replace = input.replace === true;
  const catalogVersion = "git-url";

  if (envelope.kind === "rules" && input.kind === "rules") {
    const listing = RulesCatalogListingSchema.parse(envelope.listing);
    const packId = safeRulesInstallId(listing.id);
    if (rulesPackExists(deps.workspaceRoot, packId) && !replace) {
      return {
        status: "conflict",
        kind: "rules",
        existingId: packId,
        existingName: listing.name,
        message: `Rules pack '${listing.name}' is already installed.`,
      };
    }
    const installed = installProjectRulesPack({
      workspaceRoot: deps.workspaceRoot,
      listing,
      catalogVersion,
      source: "git-url",
      gitUrl: sourceUrl,
      ...(commitRef ? { gitCommit: commitRef } : {}),
      replace,
    });
    return {
      status: "installed",
      kind: "rules",
      packId: installed.packId,
      sourceUrl,
    };
  }

  if (envelope.kind === "agent" && input.kind === "agents") {
    const listing = AgentCatalogListingSchema.parse(envelope.listing);
    const existing = findMarketplaceAgentByListingId(
      deps.projectOSRoot,
      listing.id,
    );
    if (existing && !replace) {
      return {
        status: "conflict",
        kind: "agents",
        existingId: listing.id,
        existingName: listing.name,
        message: `Agent '${listing.name}' is already installed.`,
      };
    }
    installAgentFromListing({
      projectOSRoot: deps.projectOSRoot,
      ...(deps.projectId ? { projectId: deps.projectId } : {}),
      listing,
      catalogVersion,
      source: "git-url",
      replace,
    });
    return {
      status: "installed",
      kind: "agents",
      listingId: listing.id,
      sourceUrl,
    };
  }

  if (envelope.kind === "workflow" && input.kind === "workflows") {
    const listing = WorkflowCatalogListingSchema.parse(envelope.listing);
    const installed = listInstalledWorkflowListingIds(deps.workspaceRoot);
    if (installed.includes(listing.id) && !replace) {
      return {
        status: "conflict",
        kind: "workflows",
        existingId: listing.id,
        existingName: listing.name,
        message: `Workflow '${listing.name}' is already installed.`,
      };
    }
    installWorkflowFromListing({
      workspaceRoot: deps.workspaceRoot,
      listing,
      catalogVersion,
      source: "git-url",
      replace,
    });
    return {
      status: "installed",
      kind: "workflows",
      listingId: listing.id,
      sourceUrl,
    };
  }

  if (envelope.kind === "stencil" && input.kind === "stencils") {
    const listing = StencilCatalogListingSchema.parse(envelope.listing);
    const installed = listInstalledStencilListingIds(deps.workspaceRoot);
    if (installed.includes(listing.id) && !replace) {
      return {
        status: "conflict",
        kind: "stencils",
        existingId: listing.id,
        existingName: listing.name,
        message: `Stencil pack '${listing.name}' is already installed.`,
      };
    }
    installStencilFromListing({
      workspaceRoot: deps.workspaceRoot,
      listing,
      catalogVersion,
      source: "git-url",
      replace,
    });
    return {
      status: "installed",
      kind: "stencils",
      listingId: listing.id,
      sourceUrl,
    };
  }

  throw new MarketplaceGitUrlError(
    `Pack kind '${envelope.kind}' does not match install kind '${input.kind}'`,
  );
}

/**
 * Deterministic install-from-URL for marketplace.
 * GitHub git URLs use Contents API; bare `.json` HTTP URLs fetch a Capability Pack.
 * Non-GitHub git hosts without a pack JSON URL suggest agent fallback.
 */
export async function installFromGitUrl(
  input: InstallFromGitUrlInput,
  deps: InstallFromGitUrlDeps,
): Promise<InstallFromGitUrlResult> {
  const kind = input.kind;

  // Bare HTTP pack JSON (any allowed host via SSRF guard)
  if (looksLikeHttpPackJsonUrl(input.url)) {
    let parsedGit: ReturnType<typeof parseMarketplaceGitUrl> | null = null;
    try {
      parsedGit = parseMarketplaceGitUrl(input.url);
    } catch {
      parsedGit = null;
    }

    // Prefer GitHub Contents API when the JSON lives on github.com
    if (parsedGit?.isGithub && (kind === "mcp" || kind === "skills")) {
      // fall through to git path below — MCP/Skill don't use pack JSON
    } else if (parsedGit?.isGithub && kind !== "mcp" && kind !== "skills") {
      // use github resolver below
    } else if (kind !== "mcp" && kind !== "skills") {
      try {
        const { envelope, sourceUrl } = await fetchCapabilityPackFromHttpUrl({
          url: input.url,
          ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
        });
        assertPackKindMatchesTab(envelope, kind);
        return installEnvelope(envelope, deps, input, sourceUrl);
      } catch (error) {
        const message =
          error instanceof MarketplaceGitUrlError
            ? error.message
            : error instanceof Error
              ? error.message
              : "Install from pack URL failed";
        return failed(kind, message);
      }
    }
  }

  let parsed;
  try {
    parsed = parseMarketplaceGitUrl(input.url);
  } catch (error) {
    // Last chance: non-git URL that still looks like pack JSON
    if (looksLikeHttpPackJsonUrl(input.url) && kind !== "mcp" && kind !== "skills") {
      try {
        const { envelope, sourceUrl } = await fetchCapabilityPackFromHttpUrl({
          url: input.url,
          ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
        });
        assertPackKindMatchesTab(envelope, kind);
        return installEnvelope(envelope, deps, input, sourceUrl);
      } catch (packError) {
        return failed(
          kind,
          packError instanceof Error ? packError.message : "Invalid pack URL",
        );
      }
    }
    return failed(
      kind,
      error instanceof Error ? error.message : "Invalid repository URL",
    );
  }

  if (!parsed.isGithub) {
    if (looksLikeHttpPackJsonUrl(input.url) && kind !== "mcp" && kind !== "skills") {
      try {
        const { envelope, sourceUrl } = await fetchCapabilityPackFromHttpUrl({
          url: input.url,
          ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
        });
        assertPackKindMatchesTab(envelope, kind);
        return installEnvelope(envelope, deps, input, sourceUrl);
      } catch (error) {
        return failed(
          kind,
          error instanceof Error ? error.message : "Install from pack URL failed",
        );
      }
    }
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

    if (kind === "mcp") {
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
    }

    if (kind === "rules") {
      const resolved = await resolveRulesFromGithub({ parsed, client });
      const sourceUrl = parsed.httpsUrl.replace(/\.git$/u, "");
      const packId = safeRulesInstallId(resolved.listing.id);
      if (rulesPackExists(deps.workspaceRoot, packId) && input.replace !== true) {
        return {
          status: "conflict",
          kind: "rules",
          existingId: packId,
          existingName: resolved.listing.name,
          message: `Rules pack '${resolved.listing.name}' is already installed.`,
        };
      }
      const installed = installProjectRulesPack({
        workspaceRoot: deps.workspaceRoot,
        listing: resolved.listing,
        catalogVersion: "git-url",
        source: "git-url",
        gitUrl: sourceUrl,
        gitCommit: resolved.commitRef,
        replace: input.replace === true,
      });
      return {
        status: "installed",
        kind: "rules",
        packId: installed.packId,
        sourceUrl,
      };
    }

    // agents | workflows | stencils — pack JSON only
    const resolved = await resolveCapabilityPackFromGithub({
      parsed,
      client,
      installKind: kind,
    });
    return installEnvelope(
      resolved.envelope,
      deps,
      input,
      resolved.sourceUrl,
      resolved.commitRef,
    );
  } catch (error) {
    if (
      error instanceof RulesInstallError ||
      error instanceof AgentInstallError ||
      error instanceof WorkflowInstallError ||
      error instanceof StencilInstallError
    ) {
      return failed(kind, error.message);
    }
    const message =
      error instanceof MarketplaceGitUrlError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Install from git URL failed";
    return failed(kind, message);
  }
}
