import { existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";

import type { AgentCatalogListing } from "../contracts/agent-marketplace.js";
import { AgentCatalogListingSchema } from "../contracts/agent-marketplace.js";
import type { AgentDefinition } from "../contracts/agent-pool-trace.js";
import {
  isWorkforceAgent,
  type WorkforceAgentDraft,
} from "../contracts/agent-workforce.js";
import type { McpServerConfig } from "../contracts/settings.js";
import {
  agentDefinitionPath,
  listWorkforceAgents,
  readAgentDefinition,
  upsertAgentDefinition,
} from "./agent-pool-index.js";

export class AgentInstallError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentInstallError";
  }
}

/** Collect recommended capability listing ids from an Agent Template. */
export function collectAgentListingDependencyIds(listing: AgentCatalogListing): {
  skillIds: string[];
  mcpListingIds: string[];
  rulesPackIds: string[];
} {
  const parsed = AgentCatalogListingSchema.parse(listing);
  return {
    skillIds: [
      ...new Set([...(parsed.skillIds ?? []), ...(parsed.dependsOn?.skills ?? [])]),
    ],
    mcpListingIds: [...new Set(parsed.dependsOn?.mcpListings ?? [])],
    rulesPackIds: [...new Set(parsed.dependsOn?.rules ?? [])],
  };
}

/**
 * Map an Agent Template (catalog listing) into a Workforce draft for a new
 * Instance (`agent_<uuid>`). Catalog install still uses stable `agent_mkt_*`.
 */
export function workforceDraftFromAgentListing(
  listing: AgentCatalogListing,
  options?: {
    displayNameSuffix?: string;
    mcpServerIds?: string[];
  },
): WorkforceAgentDraft {
  const parsed = AgentCatalogListingSchema.parse(listing);
  const { skillIds } = collectAgentListingDependencyIds(parsed);
  const hintLine =
    parsed.permissionHints && parsed.permissionHints.length > 0
      ? `Permission hints: ${parsed.permissionHints.join(", ")}`
      : undefined;
  const permissionNotes = [parsed.permissionNotes?.trim(), hintLine]
    .filter((part): part is string => Boolean(part && part.length > 0))
    .join("\n");
  const baseName = parsed.name.trim();
  const suffix = options?.displayNameSuffix?.trim();
  const mcpServerIds = [
    ...new Set((options?.mcpServerIds ?? []).map((id) => id.trim()).filter(Boolean)),
  ];
  return {
    displayName: suffix ? `${baseName} ${suffix}`.slice(0, 120) : baseName,
    ...(parsed.roleLabel ? { roleLabel: parsed.roleLabel } : {}),
    instructions: parsed.instructions ?? "",
    modelProfileId: null,
    skillIds,
    mcpServerIds,
    ...(permissionNotes ? { permissionNotes: permissionNotes.slice(0, 2000) } : {}),
  };
}

/** Stable definition id for catalog / export installs. */
export function marketplaceAgentDefinitionId(listingId: string): string {
  const slug = listingId
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 80);
  if (!slug || slug === "." || slug === ".." || slug.includes("..")) {
    throw new AgentInstallError(`Invalid agent listing id '${listingId}'`);
  }
  return `agent_mkt_${slug}`;
}

export function listInstalledMarketplaceAgentListingIds(
  projectOSRoot: string,
): string[] {
  const ids: string[] = [];
  for (const agent of listWorkforceAgents(projectOSRoot)) {
    const listingId = agent.config.marketplaceProvenance?.listingId;
    if (listingId) ids.push(listingId);
  }
  return [...new Set(ids)].sort((a, b) => a.localeCompare(b));
}

export function findMarketplaceAgentByListingId(
  projectOSRoot: string,
  listingId: string,
): AgentDefinition | null {
  const preferredId = marketplaceAgentDefinitionId(listingId);
  const preferred = readAgentDefinition(projectOSRoot, preferredId);
  if (
    preferred &&
    isWorkforceAgent(preferred) &&
    preferred.config.marketplaceProvenance?.listingId === listingId
  ) {
    return preferred;
  }
  for (const agent of listWorkforceAgents(projectOSRoot)) {
    if (agent.config.marketplaceProvenance?.listingId === listingId) {
      return agent;
    }
  }
  return null;
}

export function installAgentFromListing(input: {
  projectOSRoot: string;
  projectId?: string;
  listing: AgentCatalogListing;
  catalogVersion: string;
  source?: "catalog" | "export-reimport" | "git-url";
  replace?: boolean;
  /** MCP server ids already installed for this Template's dependsOn.mcpListings. */
  mcpServerIds?: string[];
}): AgentDefinition {
  const listing = AgentCatalogListingSchema.parse(input.listing);
  const definitionId = marketplaceAgentDefinitionId(listing.id);
  const existing = readAgentDefinition(input.projectOSRoot, definitionId);
  if (existing && input.replace !== true) {
    throw new AgentInstallError(
      `Agent '${listing.name}' already installed. Pass replace: true to overwrite.`,
    );
  }
  const now = new Date().toISOString();
  const draft = workforceDraftFromAgentListing(listing, {
    ...(input.mcpServerIds?.length ? { mcpServerIds: input.mcpServerIds } : {}),
  });
  return upsertAgentDefinition(input.projectOSRoot, {
    definitionId,
    ...(input.projectId ? { projectId: input.projectId } : {}),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    config: {
      kind: "workforce",
      displayName: draft.displayName,
      ...(draft.roleLabel
        ? { role: draft.roleLabel, roleLabel: draft.roleLabel }
        : {}),
      instructions: draft.instructions,
      modelProfileId: null,
      skillIds: draft.skillIds,
      mcpServerIds: draft.mcpServerIds,
      ...(draft.permissionNotes
        ? { permissionNotes: draft.permissionNotes }
        : {}),
      marketplaceProvenance: {
        listingId: listing.id,
        catalogVersion: input.catalogVersion,
        trustTier: listing.trustTier,
        listingVersion: listing.version,
        installedAt: now,
        source: input.source ?? "catalog",
      },
    },
  });
}

export function uninstallAgentFromListing(input: {
  projectOSRoot: string;
  listingId: string;
}): void {
  const agent = findMarketplaceAgentByListingId(input.projectOSRoot, input.listingId);
  if (!agent) {
    throw new AgentInstallError(`Agent listing '${input.listingId}' is not installed`);
  }
  if (!agent.config.marketplaceProvenance) {
    throw new AgentInstallError(
      `Agent '${agent.definitionId}' is not a marketplace install`,
    );
  }
  const path = agentDefinitionPath(input.projectOSRoot, agent.definitionId);
  if (!existsSync(path)) {
    throw new AgentInstallError(`Agent definition file missing for '${agent.definitionId}'`);
  }
  unlinkSync(path);
}

export function exportWorkforceAgentPack(input: {
  projectOSRoot: string;
  definitionId: string;
  mcpServers?: McpServerConfig[];
}): { listing: AgentCatalogListing; packJson: string } {
  const agent = readAgentDefinition(input.projectOSRoot, input.definitionId);
  if (!agent || !isWorkforceAgent(agent)) {
    throw new AgentInstallError(`Workforce agent '${input.definitionId}' was not found`);
  }

  const mcpListings: string[] = [];
  for (const serverId of agent.config.mcpServerIds ?? []) {
    const server = (input.mcpServers ?? []).find((entry) => entry.id === serverId);
    const listingId = server?.provenance?.listingId;
    if (listingId) mcpListings.push(listingId);
  }

  const slugBase = agent.config.displayName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 48);
  const short = agent.definitionId.replace(/^agent_/u, "").slice(0, 8);
  const listingId = `community.export.${slugBase || "agent"}-${short}`;

  const listing = AgentCatalogListingSchema.parse({
    id: listingId,
    name: agent.config.displayName,
    description:
      agent.config.roleLabel ??
      agent.config.role ??
      `Exported workforce agent ${agent.config.displayName}`,
    trustTier: "community",
    version: "1.0.0",
    roleLabel: agent.config.roleLabel ?? agent.config.role,
    instructions: agent.config.instructions ?? "",
    skillIds: agent.config.skillIds ?? [],
    ...(agent.config.permissionNotes
      ? { permissionNotes: agent.config.permissionNotes }
      : {}),
    dependsOn: {
      ...(agent.config.skillIds?.length
        ? { skills: [...agent.config.skillIds] }
        : {}),
      ...(mcpListings.length ? { mcpListings: [...new Set(mcpListings)] } : {}),
    },
  });

  return {
    listing,
    packJson: `${JSON.stringify({ kind: "agent", listing }, null, 2)}\n`,
  };
}

export function projectOSRootFromWorkspace(workspaceRoot: string): string {
  return join(workspaceRoot, ".projectos");
}
