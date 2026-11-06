import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve, sep } from "node:path";

import { CapabilityPackProvenanceSchema } from "../contracts/capability-marketplace.js";
import {
  RULES_PACK_MANIFEST_FILE,
  RulesCatalogListingSchema,
  type RulesCatalogListing,
} from "../contracts/rules-marketplace.js";

export class RulesInstallError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RulesInstallError";
  }
}

export function safeRulesInstallId(listingId: string): string {
  const slug = listingId
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 80);
  if (!slug || slug === "." || slug === ".." || slug.includes("..")) {
    throw new RulesInstallError(`Invalid rules listing id '${listingId}'`);
  }
  return slug;
}

export function projectRulesRoot(workspaceRoot: string): string {
  return join(workspaceRoot, ".projectos", "rules");
}

function assertContainedPath(root: string, candidate: string): string {
  const resolvedRoot = resolve(root);
  const resolved = resolve(candidate);
  const prefix = resolvedRoot.endsWith(sep) ? resolvedRoot : `${resolvedRoot}${sep}`;
  if (resolved !== resolvedRoot && !resolved.startsWith(prefix)) {
    throw new RulesInstallError("Rules install path escapes rules root");
  }
  return resolved;
}

export function rulesPackExists(workspaceRoot: string, listingId: string): boolean {
  const id = safeRulesInstallId(listingId);
  const packDir = join(projectRulesRoot(workspaceRoot), id);
  return existsSync(join(packDir, RULES_PACK_MANIFEST_FILE));
}

export function listInstalledRulesPackIds(workspaceRoot: string): string[] {
  const root = projectRulesRoot(workspaceRoot);
  if (!existsSync(root)) return [];
  const ids: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const manifestPath = join(root, entry.name, RULES_PACK_MANIFEST_FILE);
    if (!existsSync(manifestPath)) continue;
    try {
      const raw = JSON.parse(readFileSync(manifestPath, "utf8"));
      const parsed = CapabilityPackProvenanceSchema.safeParse(raw);
      if (parsed.success && parsed.data.kind === "rules") {
        ids.push(safeRulesInstallId(parsed.data.listingId));
      }
    } catch {
      // ignore unreadable manifests
    }
  }
  return ids.sort((a, b) => a.localeCompare(b));
}

export function uninstallProjectRulesPack(input: {
  workspaceRoot: string;
  listingId: string;
}): void {
  const id = safeRulesInstallId(input.listingId);
  const rulesRoot = projectRulesRoot(input.workspaceRoot);
  const packDir = assertContainedPath(rulesRoot, join(rulesRoot, id));
  const manifestPath = join(packDir, RULES_PACK_MANIFEST_FILE);
  if (!existsSync(manifestPath)) {
    throw new RulesInstallError(
      `Rules pack '${id}' is not a catalog install (missing ${RULES_PACK_MANIFEST_FILE})`,
    );
  }
  rmSync(packDir, { recursive: true, force: true });
}

export function installProjectRulesPack(input: {
  workspaceRoot: string;
  listing: RulesCatalogListing;
  catalogVersion: string;
  source?: "catalog" | "manual" | "git-url" | "export-reimport";
  gitUrl?: string;
  gitCommit?: string;
  replace?: boolean;
}): { packId: string; relativeRoot: string } {
  const id = safeRulesInstallId(input.listing.id);
  const rulesRoot = projectRulesRoot(input.workspaceRoot);
  mkdirSync(rulesRoot, { recursive: true });
  const packDir = assertContainedPath(rulesRoot, join(rulesRoot, id));
  const manifestPath = join(packDir, RULES_PACK_MANIFEST_FILE);
  if (existsSync(manifestPath) && input.replace !== true) {
    throw new RulesInstallError(
      `Rules pack '${id}' already exists. Pass replace: true to overwrite.`,
    );
  }
  if (existsSync(packDir) && input.replace === true) {
    rmSync(packDir, { recursive: true, force: true });
  }
  mkdirSync(packDir, { recursive: true });

  for (const [rel, contents] of Object.entries(input.listing.files)) {
    if (
      !rel.trim() ||
      rel.includes("\0") ||
      rel.startsWith("/") ||
      rel.includes("..") ||
      rel.includes("\\") ||
      !/\.md$/iu.test(rel)
    ) {
      throw new RulesInstallError(`Unsafe rules file path '${rel}'`);
    }
    const target = assertContainedPath(packDir, join(packDir, rel));
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, contents, "utf8");
  }

  const provenance = CapabilityPackProvenanceSchema.parse({
    listingId: input.listing.id,
    catalogVersion: input.catalogVersion,
    trustTier: input.listing.trustTier,
    listingVersion: input.listing.version,
    installedAt: new Date().toISOString(),
    source: input.source ?? "catalog",
    kind: "rules",
    ...(input.gitUrl ? { gitUrl: input.gitUrl } : {}),
    ...(input.gitCommit ? { gitCommit: input.gitCommit.slice(0, 64) } : {}),
  });
  writeFileSync(manifestPath, `${JSON.stringify(provenance, null, 2)}\n`, "utf8");

  return {
    packId: id,
    relativeRoot: `.projectos/rules/${id}/`,
  };
}

/** Build an exportable rules listing from an installed marketplace pack directory. */
export function exportRulesPackFromDisk(input: {
  workspaceRoot: string;
  listingId: string;
}): { listing: RulesCatalogListing; packJson: string } {
  const id = safeRulesInstallId(input.listingId);
  const packDir = join(projectRulesRoot(input.workspaceRoot), id);
  const manifestPath = join(packDir, RULES_PACK_MANIFEST_FILE);
  if (!existsSync(manifestPath)) {
    throw new RulesInstallError(
      `Rules pack '${id}' is not a catalog install (missing ${RULES_PACK_MANIFEST_FILE})`,
    );
  }
  const provenance = CapabilityPackProvenanceSchema.parse(
    JSON.parse(readFileSync(manifestPath, "utf8")),
  );
  if (provenance.kind !== "rules") {
    throw new RulesInstallError(`Pack '${id}' is not a rules marketplace install`);
  }

  const files: Record<string, string> = {};
  const walk = (dir: string, prefix: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === RULES_PACK_MANIFEST_FILE) continue;
      const abs = join(dir, entry.name);
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(abs, rel);
        continue;
      }
      if (!/\.md$/iu.test(entry.name)) continue;
      files[rel] = readFileSync(abs, "utf8");
    }
  };
  walk(packDir, "");
  if (Object.keys(files).length === 0) {
    throw new RulesInstallError(`Rules pack '${id}' has no markdown files to export`);
  }

  const listing = RulesCatalogListingSchema.parse({
    id: provenance.listingId,
    name: id,
    trustTier: provenance.trustTier,
    version: provenance.listingVersion,
    files,
  });

  const packJson = `${JSON.stringify({ kind: "rules", listing }, null, 2)}\n`;
  return { listing, packJson };
}
