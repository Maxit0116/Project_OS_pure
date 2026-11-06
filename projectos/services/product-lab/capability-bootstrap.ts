import type {
  LabCapabilityProposal,
  LabLaunchProfile,
} from "../../contracts/product-lab.js";
import { newLabId } from "../../contracts/product-lab.js";

export interface MarketplaceListingHit {
  id: string;
  name: string;
  summary?: string;
  kind: "mcp" | "skill" | "rules";
  gitUrl?: string | null;
}

export interface CapabilityNeedSpec {
  need: string;
  label: string;
  marketplaceKeywords: string[];
  webSearchQuery: string;
}

const NEED_SPECS: CapabilityNeedSpec[] = [
  {
    need: "xcode",
    label: "Xcode / SwiftUI macOS or iOS tooling",
    marketplaceKeywords: ["xcode", "swift", "ios", "macos", "apple"],
    webSearchQuery:
      "MCP server Xcode iOS Simulator launch app for AI agents github",
  },
  {
    need: "ios-simulator",
    label: "iOS Simulator control",
    marketplaceKeywords: ["ios", "simulator", "xcode", "iphone"],
    webSearchQuery: "MCP iOS Simulator control AI coding agent github",
  },
  {
    need: "android-studio",
    label: "Android Studio / Gradle tooling",
    marketplaceKeywords: ["android", "adb", "emulator", "gradle"],
    webSearchQuery:
      "MCP server Android emulator adb Android Studio AI agent github",
  },
  {
    need: "android-emulator",
    label: "Android Emulator / ADB",
    marketplaceKeywords: ["android", "emulator", "adb"],
    webSearchQuery: "MCP Android emulator ADB launch app github",
  },
];

export function capabilityNeedSpecs(
  needs: readonly string[],
): CapabilityNeedSpec[] {
  const set = new Set(needs);
  return NEED_SPECS.filter((spec) => set.has(spec.need));
}

export function matchMarketplaceListings(
  need: string,
  listings: readonly MarketplaceListingHit[],
): MarketplaceListingHit[] {
  const spec = NEED_SPECS.find((item) => item.need === need);
  if (!spec) return [];
  const keys = spec.marketplaceKeywords.map((k) => k.toLowerCase());
  return listings
    .filter((listing) => {
      const hay = `${listing.id} ${listing.name} ${listing.summary ?? ""}`.toLowerCase();
      return keys.some((key) => hay.includes(key));
    })
    .slice(0, 5);
}

export function buildMarketplaceProposals(
  profile: LabLaunchProfile,
  listings: readonly MarketplaceListingHit[],
): LabCapabilityProposal[] {
  const proposals: LabCapabilityProposal[] = [];
  for (const need of profile.capabilityNeeds) {
    const hits = matchMarketplaceListings(need, listings);
    const spec = NEED_SPECS.find((item) => item.need === need);
    if (hits.length === 0) {
      // Always surface a searchable stub so the Marketplace prep page can
      // offer search / open catalog even when no keyword match exists yet.
      proposals.push({
        id: newLabId("cap"),
        need,
        kind: "mcp",
        source: "builtin",
        title: spec?.label ?? `Capability: ${need}`,
        detail:
          spec?.webSearchQuery ??
          `No Marketplace hit for "${need}". Search the web or open Marketplace to install an MCP/skill.`,
        listingId: null,
        gitUrl: null,
        homepageUrl: null,
        status: "proposed",
        error: null,
      });
      continue;
    }
    for (const hit of hits) {
      proposals.push({
        id: newLabId("cap"),
        need,
        kind: hit.kind,
        source: "marketplace",
        title: hit.name,
        detail: hit.summary ?? `Marketplace listing for ${need}`,
        listingId: hit.id,
        gitUrl: hit.gitUrl ?? null,
        homepageUrl: null,
        status: "proposed",
        error: null,
      });
    }
  }
  return proposals;
}

export interface InstalledCapabilityHit {
  need: string;
  kind: "mcp" | "skill" | "rules";
  id: string;
  name: string;
}

export interface InstalledCapabilitySources {
  mcpServers?: ReadonlyArray<{
    id: string;
    name?: string | null;
    enabled?: boolean | null;
  }>;
  skills?: ReadonlyArray<{ id: string; name?: string | null }>;
}

/** Match already-installed MCP/skills to Lab capability needs via keywords. */
export function matchInstalledCapabilities(
  needs: readonly string[],
  sources: InstalledCapabilitySources,
): InstalledCapabilityHit[] {
  const hits: InstalledCapabilityHit[] = [];
  const seen = new Set<string>();
  for (const need of needs) {
    const spec = NEED_SPECS.find((item) => item.need === need);
    if (!spec) continue;
    const keys = spec.marketplaceKeywords.map((k) => k.toLowerCase());
    for (const server of sources.mcpServers ?? []) {
      if (server.enabled === false) continue;
      const hay = `${server.id} ${server.name ?? ""}`.toLowerCase();
      if (!keys.some((key) => hay.includes(key))) continue;
      const dedupe = `${need}:mcp:${server.id}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      hits.push({
        need,
        kind: "mcp",
        id: server.id,
        name: (server.name ?? server.id).trim() || server.id,
      });
    }
    for (const skill of sources.skills ?? []) {
      const hay = `${skill.id} ${skill.name ?? ""}`.toLowerCase();
      if (!keys.some((key) => hay.includes(key))) continue;
      const dedupe = `${need}:skill:${skill.id}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      hits.push({
        need,
        kind: "skill",
        id: skill.id,
        name: (skill.name ?? skill.id).trim() || skill.id,
      });
    }
  }
  return hits;
}

export type LabCapabilityInventoryStatus =
  | "ready"
  | "installable"
  | "searching"
  | "installing"
  | "installed"
  | "denied"
  | "failed"
  | "missing";

/** One row in the Marketplace Lab prep page capability panorama. */
export interface LabCapabilityInventoryItem {
  need: string;
  label: string;
  status: LabCapabilityInventoryStatus;
  bindingTitle: string | null;
  bindingKind: LabCapabilityProposal["kind"] | null;
  bindingId: string | null;
  proposals: LabCapabilityProposal[];
}

/**
 * Full task capability inventory: every need, including already-installed
 * bindings and pending install proposals for the Marketplace prep page.
 */
export function buildLabCapabilityInventory(
  needs: readonly string[],
  proposals: readonly LabCapabilityProposal[],
  installedHits: readonly InstalledCapabilityHit[],
  options?: { searching?: boolean },
): LabCapabilityInventoryItem[] {
  const searching = Boolean(options?.searching);
  return needs.map((need) => {
    const spec = NEED_SPECS.find((item) => item.need === need);
    const label = spec?.label ?? need;
    const installed = installedHits.find((hit) => hit.need === need);
    const forNeed = proposals.filter((p) => p.need === need);
    if (installed) {
      return {
        need,
        label,
        status: "ready" as const,
        bindingTitle: installed.name,
        bindingKind: installed.kind,
        bindingId: installed.id,
        proposals: forNeed,
      };
    }
    const installedProposal = forNeed.find((p) => p.status === "installed");
    if (installedProposal) {
      return {
        need,
        label,
        status: "installed" as const,
        bindingTitle: installedProposal.title,
        bindingKind: installedProposal.kind,
        bindingId: installedProposal.listingId,
        proposals: forNeed,
      };
    }
    if (forNeed.some((p) => p.status === "installing")) {
      const active = forNeed.find((p) => p.status === "installing")!;
      return {
        need,
        label,
        status: "installing" as const,
        bindingTitle: active.title,
        bindingKind: active.kind,
        bindingId: active.listingId,
        proposals: forNeed,
      };
    }
    if (
      forNeed.length > 0 &&
      forNeed.every((p) => p.status === "denied")
    ) {
      return {
        need,
        label,
        status: "denied" as const,
        bindingTitle: null,
        bindingKind: null,
        bindingId: null,
        proposals: forNeed,
      };
    }
    if (forNeed.some((p) => p.status === "failed")) {
      const failed = forNeed.find((p) => p.status === "failed")!;
      return {
        need,
        label,
        status: "failed" as const,
        bindingTitle: failed.title,
        bindingKind: failed.kind,
        bindingId: failed.listingId,
        proposals: forNeed,
      };
    }
    const actionable = forNeed.filter(
      (p) =>
        (p.status === "proposed" || p.status === "approved") &&
        (Boolean(p.listingId) || Boolean(p.gitUrl)),
    );
    if (actionable.length > 0) {
      const best = actionable[0]!;
      return {
        need,
        label,
        status: "installable" as const,
        bindingTitle: best.title,
        bindingKind: best.kind,
        bindingId: best.listingId,
        proposals: forNeed,
      };
    }
    if (searching) {
      return {
        need,
        label,
        status: "searching" as const,
        bindingTitle: null,
        bindingKind: null,
        bindingId: null,
        proposals: forNeed,
      };
    }
    return {
      need,
      label,
      status: "missing" as const,
      bindingTitle: forNeed[0]?.title ?? null,
      bindingKind: forNeed[0]?.kind ?? null,
      bindingId: null,
      proposals: forNeed,
    };
  });
}

/** Pending install proposals shown in the Marketplace prep "needs permission" list. */
export function pendingInstallProposals(
  proposals: readonly LabCapabilityProposal[],
  inventory: readonly LabCapabilityInventoryItem[],
): LabCapabilityProposal[] {
  const readyNeeds = new Set(
    inventory
      .filter((item) => item.status === "ready" || item.status === "installed")
      .map((item) => item.need),
  );
  return proposals.filter(
    (p) =>
      !readyNeeds.has(p.need) &&
      (p.status === "proposed" ||
        p.status === "installing" ||
        p.status === "failed" ||
        p.status === "approved"),
  );
}

/** Prompt for Agent to search the public web for missing capabilities. */
export function buildLabCapabilitySearchPrompt(
  profile: LabLaunchProfile,
  existing: readonly LabCapabilityProposal[],
): string {
  const specs = capabilityNeedSpecs(profile.capabilityNeeds);
  const covered = new Set(
    existing.filter((p) => p.source === "marketplace").map((p) => p.need),
  );
  const missing = specs.filter((spec) => !covered.has(spec.need));
  const focus = missing.length > 0 ? missing : specs;

  const queries = focus
    .map((spec) => `- ${spec.need}: ${spec.webSearchQuery}`)
    .join("\n");

  return [
    "Product Lab capability bootstrap — this workspace needs IDE / simulator capabilities that are not built into Project OS.",
    "Search the public web (GitHub, npm, docs) for MCP servers, Agent Skills, or rules that can open Xcode / Android Studio / simulators and run the app.",
    "Also note any Marketplace-quality packages if you already know them.",
    "",
    `Surface: ${profile.surface}`,
    `Needs: ${profile.capabilityNeeds.join(", ") || "(none)"}`,
    `Hints: ${profile.startHints.join("; ")}`,
    "",
    "Search queries to run:",
    queries,
    "",
    "Rules:",
    "1. Do NOT install anything yourself. Only discover candidates.",
    "2. For each candidate, report: title, kind (mcp|skill|rules), one-line why, and a git or homepage URL.",
    "3. Prefer maintained open-source MCP servers with clear install instructions.",
    "4. End with a machine-readable block:",
    "```lab_capabilities",
    JSON.stringify(
      [
        {
          need: "ios-simulator",
          kind: "mcp",
          title: "Example MCP",
          detail: "Why it helps",
          gitUrl: "https://github.com/org/repo",
          homepageUrl: null,
        },
      ],
      null,
      2,
    ),
    "```",
    "Replace the example with real findings (0–8 items). If nothing trustworthy exists, return an empty array and say LAB_CAPABILITIES_NONE.",
  ].join("\n");
}

export function parseLabCapabilitySearchResult(
  text: string,
  fallbackNeeds: readonly string[],
): LabCapabilityProposal[] {
  const block = text.match(/```lab_capabilities\s*([\s\S]*?)```/i);
  if (!block) return [];
  try {
    const raw = JSON.parse(block[1]!.trim()) as unknown;
    if (!Array.isArray(raw)) return [];
    const proposals: LabCapabilityProposal[] = [];
    for (const item of raw.slice(0, 8)) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      const title = typeof row.title === "string" ? row.title.trim() : "";
      if (!title) continue;
      const need =
        typeof row.need === "string" && row.need.trim()
          ? row.need.trim()
          : fallbackNeeds[0] ?? "other";
      const kindRaw = typeof row.kind === "string" ? row.kind : "mcp";
      const kind =
        kindRaw === "skill" || kindRaw === "rules" || kindRaw === "mcp"
          ? kindRaw
          : "other";
      proposals.push({
        id: newLabId("cap"),
        need,
        kind,
        source: "web",
        title: title.slice(0, 240),
        detail:
          typeof row.detail === "string" ? row.detail.slice(0, 2_000) : "",
        listingId: null,
        gitUrl:
          typeof row.gitUrl === "string" ? row.gitUrl.slice(0, 2_048) : null,
        homepageUrl:
          typeof row.homepageUrl === "string"
            ? row.homepageUrl.slice(0, 2_048)
            : null,
        status: "proposed",
        error: null,
      });
    }
    return proposals;
  } catch {
    return [];
  }
}
