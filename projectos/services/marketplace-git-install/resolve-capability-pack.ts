import { z } from "zod";

import { AgentCatalogListingSchema } from "../../contracts/agent-marketplace.js";
import { RulesCatalogListingSchema } from "../../contracts/rules-marketplace.js";
import { StencilCatalogListingSchema } from "../../contracts/stencil-marketplace.js";
import { WorkflowCatalogListingSchema } from "../../contracts/workflow-marketplace.js";
import type { MarketplaceGitInstallKind } from "../../contracts/marketplace-git-install.js";
import type { GithubContentsClient } from "./github-contents.js";
import type { ParsedMarketplaceGitUrl } from "./parse-git-url.js";
import { MarketplaceGitUrlError } from "./parse-git-url.js";

const PackKindSchema = z.enum(["rules", "agent", "workflow", "stencil"]);

export const CapabilityPackEnvelopeSchema = z
  .object({
    kind: PackKindSchema,
    listing: z.unknown(),
  })
  .strict();

export type CapabilityPackEnvelope = z.infer<typeof CapabilityPackEnvelopeSchema>;

const KIND_TO_PACK: Record<
  Exclude<MarketplaceGitInstallKind, "mcp" | "skills">,
  CapabilityPackEnvelope["kind"]
> = {
  rules: "rules",
  agents: "agent",
  workflows: "workflow",
  stencils: "stencil",
};

const PACK_FILE_NAMES = [
  ".projectos-pack.json",
  "capability-pack.json",
];

export function parseCapabilityPackJson(raw: string): CapabilityPackEnvelope {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new MarketplaceGitUrlError("Pack file is not valid JSON");
  }
  const envelope = CapabilityPackEnvelopeSchema.safeParse(parsed);
  if (!envelope.success) {
    throw new MarketplaceGitUrlError(
      "Pack JSON must be { kind, listing } for rules|agent|workflow|stencil",
    );
  }
  // Validate listing shape per kind
  switch (envelope.data.kind) {
    case "rules":
      RulesCatalogListingSchema.parse(envelope.data.listing);
      break;
    case "agent":
      AgentCatalogListingSchema.parse(envelope.data.listing);
      break;
    case "workflow":
      WorkflowCatalogListingSchema.parse(envelope.data.listing);
      break;
    case "stencil":
      StencilCatalogListingSchema.parse(envelope.data.listing);
      break;
    default:
      break;
  }
  return envelope.data;
}

export function expectedPackKindForInstallKind(
  kind: MarketplaceGitInstallKind,
): CapabilityPackEnvelope["kind"] | null {
  if (kind === "mcp" || kind === "skills") return null;
  return KIND_TO_PACK[kind];
}

export function assertPackKindMatchesTab(
  envelope: CapabilityPackEnvelope,
  installKind: MarketplaceGitInstallKind,
): void {
  const expected = expectedPackKindForInstallKind(installKind);
  if (!expected) return;
  if (envelope.kind !== expected) {
    throw new MarketplaceGitUrlError(
      `Pack kind is '${envelope.kind}', but this tab expects '${expected}'`,
    );
  }
}

export type ResolvedCapabilityPack = {
  envelope: CapabilityPackEnvelope;
  commitRef: string;
  packPath: string;
  sourceUrl: string;
};

/**
 * Locate a Capability Pack JSON in a GitHub repo (pack-first; no free-form guessing).
 */
export async function resolveCapabilityPackFromGithub(input: {
  parsed: ParsedMarketplaceGitUrl;
  client: GithubContentsClient;
  installKind: MarketplaceGitInstallKind;
}): Promise<ResolvedCapabilityPack> {
  const { parsed, client, installKind } = input;
  const expected = expectedPackKindForInstallKind(installKind);
  if (!expected) {
    throw new MarketplaceGitUrlError(`Kind '${installKind}' does not use capability packs`);
  }

  const ref = parsed.ref ?? (await client.getDefaultBranch(parsed));
  const sourceUrl = parsed.httpsUrl.replace(/\.git$/u, "");

  const tryPath = async (path: string): Promise<ResolvedCapabilityPack | null> => {
    const file = await client.getFile(parsed, path, ref);
    if (!file) return null;
    const envelope = parseCapabilityPackJson(file.content);
    assertPackKindMatchesTab(envelope, installKind);
    return {
      envelope,
      commitRef: file.sha ?? ref,
      packPath: path,
      sourceUrl,
    };
  };

  if (parsed.subpath?.endsWith(".json")) {
    const resolved = await tryPath(parsed.subpath.replace(/^\/+/u, ""));
    if (resolved) return resolved;
    throw new MarketplaceGitUrlError(`Could not read pack JSON at ${parsed.subpath}`);
  }

  const sub = parsed.subpath?.replace(/^\/+|\/+$/gu, "");
  const candidates: string[] = [];
  for (const name of PACK_FILE_NAMES) {
    if (sub) candidates.push(`${sub}/${name}`);
    candidates.push(name);
  }
  if (sub?.endsWith(".json")) candidates.unshift(sub);

  for (const path of candidates) {
    try {
      const resolved = await tryPath(path);
      if (resolved) return resolved;
    } catch (error) {
      if (
        error instanceof MarketplaceGitUrlError &&
        /expects|kind is/i.test(error.message)
      ) {
        throw error;
      }
      // missing file — continue
    }
  }

  // Scan shallow tree for *.projectos-pack.json / capability-pack.json
  const tree = await client.listRecursivePaths(parsed, ref);
  const hits = tree.filter((p) => {
    const base = p.split("/").pop() ?? p;
    if (!PACK_FILE_NAMES.includes(base) && !base.endsWith(".projectos-pack.json")) {
      return false;
    }
    if (!sub) return p.split("/").length <= 4;
    return p === sub || p.startsWith(`${sub}/`);
  });

  for (const path of hits.slice(0, 8)) {
    try {
      const resolved = await tryPath(path);
      if (resolved) return resolved;
    } catch (error) {
      if (
        error instanceof MarketplaceGitUrlError &&
        /expects|kind is/i.test(error.message)
      ) {
        throw error;
      }
    }
  }

  throw new MarketplaceGitUrlError(
    `No Capability Pack JSON (kind: ${expected}) found. Export a pack or point the URL at .projectos-pack.json / capability-pack.json.`,
  );
}
