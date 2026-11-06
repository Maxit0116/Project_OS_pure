import type {
  AssembleWorkforceAgentResult,
  AssemblyBinding,
  AssemblySearchScope,
} from "../contracts/agent-assembly.js";
import { AssembleWorkforceAgentResultSchema } from "../contracts/agent-assembly.js";
import type { SkillCatalogListing } from "../contracts/skill-marketplace.js";
import type { McpCatalogListing } from "../contracts/mcp-catalog.js";
import type { RulesCatalogListing } from "../contracts/rules-marketplace.js";
import type { WorkflowCatalogListing } from "../contracts/workflow-marketplace.js";
import type { StencilCatalogListing } from "../contracts/stencil-marketplace.js";
import type { SkillDescriptor } from "../contracts/skills.js";
import { draftWorkforceAgentFromPrompt } from "./workforce-agent-draft.js";

const MAX_SELECTED_SKILLS = 5;
const MAX_SELECTED_MCP = 3;
const MAX_CATALOG_SKILL_SUGGEST = 4;
const MAX_CATALOG_MCP_SUGGEST = 3;
const MAX_SUGGEST_INSTALL = 4;

type McpInstalled = {
  id: string;
  name: string;
  trustTier?: "curated" | "community";
  listingId?: string;
};

function scoreTextMatch(promptLower: string, ...parts: Array<string | undefined>): number {
  let score = 0;
  for (const part of parts) {
    if (!part) continue;
    const lower = part.toLowerCase();
    if (!lower) continue;
    if (promptLower.includes(lower)) {
      score += Math.min(12, lower.length);
      continue;
    }
    const tokens = lower.split(/[\s/_.:-]+/).filter((t) => t.length >= 3);
    for (const token of tokens) {
      if (promptLower.includes(token)) score += Math.min(6, token.length);
    }
  }
  return score;
}

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

/**
 * Build an assembly proposal from local inventory ± catalog listings.
 * Does not write to disk or enable MCP / permissions.
 */
export function assembleWorkforceAgentFromPrompt(input: {
  prompt: string;
  scope: AssemblySearchScope;
  skills: SkillDescriptor[];
  mcpServers: McpInstalled[];
  seedSkillIds?: string[];
  seedMcpServerIds?: string[];
  skillCatalog?: SkillCatalogListing[];
  mcpCatalog?: McpCatalogListing[];
  rulesCatalog?: RulesCatalogListing[];
  workflowCatalog?: WorkflowCatalogListing[];
  stencilCatalog?: StencilCatalogListing[];
  installedSkillIds?: Set<string>;
  installedMcpListingIds?: Set<string>;
  installedRulesPackIds?: Set<string>;
  installedWorkflowListingIds?: Set<string>;
  installedStencilListingIds?: Set<string>;
}): AssembleWorkforceAgentResult {
  const prompt = input.prompt.trim();
  const promptLower = prompt.toLowerCase();
  const base = draftWorkforceAgentFromPrompt({
    prompt,
    skills: input.skills,
    mcpServers: input.mcpServers.map((s) => ({ id: s.id, name: s.name })),
  });

  const seedSkills = new Set(input.seedSkillIds ?? []);
  const seedMcps = new Set(input.seedMcpServerIds ?? []);
  const installedSkillIds =
    input.installedSkillIds ?? new Set(input.skills.map((s) => s.id));
  const installedMcpListingIds = input.installedMcpListingIds ?? new Set(
    input.mcpServers
      .map((s) => s.listingId)
      .filter((id): id is string => Boolean(id)),
  );

  const skillScores = input.skills
    .map((skill) => ({
      skill,
      score:
        scoreTextMatch(promptLower, skill.id, skill.name, skill.description) +
        (seedSkills.has(skill.id) ? 100 : 0) +
        (base.draft.skillIds.includes(skill.id) ? 20 : 0),
    }))
    .sort((a, b) => b.score - a.score || a.skill.id.localeCompare(b.skill.id));

  const mcpScores = input.mcpServers
    .map((server) => {
      const community = server.trustTier === "community";
      return {
        server,
        community,
        score:
          scoreTextMatch(promptLower, server.id, server.name, server.listingId) +
          (seedMcps.has(server.id) ? 100 : 0) +
          (base.draft.mcpServerIds.includes(server.id) ? 20 : 0),
      };
    })
    .sort((a, b) => b.score - a.score || a.server.id.localeCompare(b.server.id));

  const bindings: AssemblyBinding[] = [];

  let selectedSkills = 0;
  for (const row of skillScores) {
    const selected =
      seedSkills.has(row.skill.id) ||
      (selectedSkills < MAX_SELECTED_SKILLS && row.score >= 6);
    if (selected) selectedSkills += 1;
    bindings.push({
      kind: "skill",
      id: row.skill.id,
      name: row.skill.name,
      source: "installed",
      installed: true,
      selected,
      action: "bind",
      rationale: selected
        ? "Matched installed skill against your prompt"
        : "Related installed skill (not selected by default)",
    });
  }

  let selectedMcp = 0;
  for (const row of mcpScores) {
    const selected =
      seedMcps.has(row.server.id) ||
      (!row.community &&
        selectedMcp < MAX_SELECTED_MCP &&
        row.score >= 6);
    if (selected) selectedMcp += 1;
    bindings.push({
      kind: "mcp",
      id: row.server.id,
      name: row.server.name,
      ...(row.server.trustTier ? { trustTier: row.server.trustTier } : {}),
      source: "installed",
      installed: true,
      selected,
      action: "bind",
      ...(row.server.listingId ? { listingId: row.server.listingId } : {}),
      ...(row.community ? { risk: "community_mcp" as const } : {}),
      rationale: row.community
        ? "Community MCP — review before enabling; not selected by default"
        : selected
          ? "Matched installed MCP against your prompt"
          : "Related installed MCP (not selected by default)",
    });
  }

  const gaps: string[] = [];
  if (skillScores.length === 0 && !/skill/i.test(prompt)) {
    // no gap
  } else if (skillScores.length === 0) {
    gaps.push("No installed skills matched this prompt");
  }
  if (mcpScores.length === 0 && /\bmcp\b|工具|tool/i.test(prompt)) {
    gaps.push("No installed MCP servers matched this prompt");
  }

  if (input.scope === "local_and_catalog") {
    const catalogSkills = (input.skillCatalog ?? [])
      .map((listing) => ({
        listing,
        score: scoreTextMatch(
          promptLower,
          listing.id,
          listing.name,
          listing.description,
        ),
        installed:
          installedSkillIds.has(listing.id) ||
          input.skills.some((s) => s.id === listing.id),
      }))
      .filter((row) => row.score >= 6 && !row.installed)
      .sort((a, b) => b.score - a.score);

    let catalogSkillSelected = 0;
    for (const row of catalogSkills.slice(0, MAX_CATALOG_SKILL_SUGGEST + 4)) {
      const curated = row.listing.trustTier === "curated";
      const selected =
        curated && catalogSkillSelected < MAX_CATALOG_SKILL_SUGGEST && row.score >= 8;
      if (selected) catalogSkillSelected += 1;
      bindings.push({
        kind: "skill",
        id: row.listing.id,
        name: row.listing.name,
        trustTier: row.listing.trustTier,
        source: "catalog",
        installed: false,
        selected,
        action: "install_then_bind",
        listingId: row.listing.id,
        rationale: selected
          ? "Curated catalog skill matched — will install on confirm"
          : "Catalog skill candidate (not selected by default)",
      });
    }

    const catalogMcps = (input.mcpCatalog ?? [])
      .map((listing) => ({
        listing,
        score: scoreTextMatch(
          promptLower,
          listing.id,
          listing.name,
          listing.description,
        ),
        installed: installedMcpListingIds.has(listing.id),
      }))
      .filter((row) => row.score >= 6 && !row.installed)
      .sort((a, b) => b.score - a.score);

    let catalogMcpSelected = 0;
    for (const row of catalogMcps.slice(0, MAX_CATALOG_MCP_SUGGEST + 4)) {
      const curated = row.listing.trustTier === "curated";
      const community = row.listing.trustTier === "community";
      const selected =
        curated &&
        !community &&
        catalogMcpSelected < MAX_CATALOG_MCP_SUGGEST &&
        row.score >= 8;
      if (selected) catalogMcpSelected += 1;
      bindings.push({
        kind: "mcp",
        id: row.listing.id,
        name: row.listing.name,
        trustTier: row.listing.trustTier,
        source: "catalog",
        installed: false,
        selected,
        action: "install_then_bind",
        listingId: row.listing.id,
        ...(community ? { risk: "community_mcp" as const } : {}),
        rationale: community
          ? "Community catalog MCP — install stays disabled until you enable it"
          : selected
            ? "Curated catalog MCP matched — will install (disabled) on confirm"
            : "Catalog MCP candidate (not selected by default)",
      });
    }

    const suggestOnly: AssemblyBinding[] = [];
    for (const listing of input.rulesCatalog ?? []) {
      const score = scoreTextMatch(
        promptLower,
        listing.id,
        listing.name,
        listing.description,
      );
      if (score < 8) continue;
      const installed = input.installedRulesPackIds?.has(listing.id) ?? false;
      if (installed) continue;
      suggestOnly.push({
        kind: "rules",
        id: listing.id,
        name: listing.name,
        trustTier: listing.trustTier,
        source: "catalog",
        installed: false,
        selected: false,
        action: "suggest_install_only",
        listingId: listing.id,
        rationale: "Rules pack suggestion (not bound into the agent)",
      });
    }
    for (const listing of input.workflowCatalog ?? []) {
      const score = scoreTextMatch(
        promptLower,
        listing.id,
        listing.name,
        listing.description,
      );
      if (score < 8) continue;
      const installed = input.installedWorkflowListingIds?.has(listing.id) ?? false;
      if (installed) continue;
      suggestOnly.push({
        kind: "workflow",
        id: listing.id,
        name: listing.name,
        trustTier: listing.trustTier,
        source: "catalog",
        installed: false,
        selected: false,
        action: "suggest_install_only",
        listingId: listing.id,
        rationale: "Workflow suggestion (not bound into the agent)",
      });
    }
    for (const listing of input.stencilCatalog ?? []) {
      const score = scoreTextMatch(
        promptLower,
        listing.id,
        listing.name,
        listing.description,
      );
      if (score < 8) continue;
      const installed = input.installedStencilListingIds?.has(listing.id) ?? false;
      if (installed) continue;
      suggestOnly.push({
        kind: "stencil",
        id: listing.id,
        name: listing.name,
        trustTier: listing.trustTier,
        source: "catalog",
        installed: false,
        selected: false,
        action: "suggest_install_only",
        listingId: listing.id,
        rationale: "Stencil pack suggestion (not bound into the agent)",
      });
    }
    bindings.push(...suggestOnly.slice(0, MAX_SUGGEST_INSTALL));

    if (
      catalogSkills.length === 0 &&
      catalogMcps.length === 0 &&
      suggestOnly.length === 0
    ) {
      gaps.push("Catalog search found no additional matching capabilities");
    }
  }

  const selectedSkillIds = bindings
    .filter((b) => b.kind === "skill" && b.selected && b.installed && b.action === "bind")
    .map((b) => b.id);
  const selectedMcpIds = bindings
    .filter((b) => b.kind === "mcp" && b.selected && b.installed && b.action === "bind")
    .map((b) => b.id);

  // Draft only contains already-installed bind targets; pending installs stay in bindings.
  const draft = {
    ...base.draft,
    skillIds: uniqueById(selectedSkillIds.map((id) => ({ id }))).map((x) => x.id),
    mcpServerIds: uniqueById(selectedMcpIds.map((id) => ({ id }))).map((x) => x.id),
  };

  const rationaleParts = [
    `Scope: ${input.scope === "local" ? "local library only" : "local library + marketplace catalog"}.`,
    `${bindings.filter((b) => b.selected).length} capabilities selected by default — review checkboxes before creating.`,
  ];

  return AssembleWorkforceAgentResultSchema.parse({
    draft,
    sourcePrompt: prompt,
    scope: input.scope,
    bindings,
    ...(gaps.length ? { gaps } : {}),
    rationale: rationaleParts.join(" "),
  });
}

/** Derive create-ready draft ids from current checkbox state after installs. */
export function draftFromAssemblyBindings(input: {
  draft: AssembleWorkforceAgentResult["draft"];
  bindings: AssemblyBinding[];
}): AssembleWorkforceAgentResult["draft"] {
  const skillIds = input.bindings
    .filter(
      (b) =>
        b.kind === "skill" &&
        b.selected &&
        (b.action === "bind" || b.action === "install_then_bind") &&
        b.installed,
    )
    .map((b) => b.id);
  const mcpServerIds = input.bindings
    .filter(
      (b) =>
        b.kind === "mcp" &&
        b.selected &&
        (b.action === "bind" || b.action === "install_then_bind") &&
        b.installed,
    )
    .map((b) => b.id);
  return {
    ...input.draft,
    skillIds: [...new Set(skillIds)],
    mcpServerIds: [...new Set(mcpServerIds)],
  };
}
