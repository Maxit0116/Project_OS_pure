import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

import {
  UI_STENCIL_CATALOG,
  getStencilById as getBuiltinStencilById,
  setProjectStencilOverlay,
  type StencilDefinition,
} from "../contracts/ui-stencil.js";
import {
  StencilCatalogListingSchema,
  UserStencilPackFileSchema,
  type StencilCatalogListing,
  type UserStencilPackFile,
} from "../contracts/stencil-marketplace.js";

export class StencilInstallError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StencilInstallError";
  }
}

const STENCILS_DIR = join(".projectos", "stencils");

const builtinIdSet = new Set(UI_STENCIL_CATALOG.map((item) => item.id));

export function safeStencilInstallId(listingId: string): string {
  const slug = listingId
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 80);
  if (!slug || slug === "." || slug === ".." || slug.includes("..")) {
    throw new StencilInstallError(`Invalid stencil listing id '${listingId}'`);
  }
  return slug;
}

export function userStencilPacksRoot(workspaceRoot: string): string {
  return join(workspaceRoot, STENCILS_DIR);
}

function packFilePath(workspaceRoot: string, listingId: string): string {
  return join(
    userStencilPacksRoot(workspaceRoot),
    `${safeStencilInstallId(listingId)}.json`,
  );
}

export function listUserStencilDefinitions(
  workspaceRoot: string,
): StencilDefinition[] {
  const root = userStencilPacksRoot(workspaceRoot);
  if (!existsSync(root)) return [];
  const byId = new Map<string, StencilDefinition>();
  for (const name of readdirSync(root)) {
    if (!name.endsWith(".json")) continue;
    try {
      const raw = JSON.parse(readFileSync(join(root, name), "utf8"));
      const parsed = UserStencilPackFileSchema.safeParse(raw);
      if (!parsed.success) continue;
      for (const stencil of parsed.data.stencils) {
        if (builtinIdSet.has(stencil.id)) continue;
        byId.set(stencil.id, stencil);
      }
    } catch {
      // skip corrupt
    }
  }
  return [...byId.values()].sort((a, b) => a.title.localeCompare(b.title));
}

export function listInstalledStencilListingIds(workspaceRoot: string): string[] {
  const root = userStencilPacksRoot(workspaceRoot);
  if (!existsSync(root)) return [];
  const ids: string[] = [];
  for (const name of readdirSync(root)) {
    if (!name.endsWith(".json")) continue;
    try {
      const raw = JSON.parse(readFileSync(join(root, name), "utf8"));
      const parsed = UserStencilPackFileSchema.safeParse(raw);
      if (!parsed.success) continue;
      ids.push(parsed.data.provenance?.listingId ?? parsed.data.listingId);
    } catch {
      // skip
    }
  }
  return [...new Set(ids)].sort((a, b) => a.localeCompare(b));
}

export function listMergedStencilDefinitions(
  workspaceRoot: string,
): StencilDefinition[] {
  const user = listUserStencilDefinitions(workspaceRoot);
  const out = [...UI_STENCIL_CATALOG];
  for (const def of user) {
    if (!builtinIdSet.has(def.id)) out.push(def);
  }
  return out;
}

/** Sync in-memory overlay used by getStencilById / Capture brief paths. */
export function refreshProjectStencilOverlay(workspaceRoot: string): void {
  setProjectStencilOverlay(listUserStencilDefinitions(workspaceRoot));
}

export function installStencilFromListing(input: {
  workspaceRoot: string;
  listing: StencilCatalogListing;
  catalogVersion: string;
  source?: "catalog" | "export-reimport" | "git-url";
  replace?: boolean;
}): StencilDefinition[] {
  const listing = StencilCatalogListingSchema.parse(input.listing);
  for (const stencil of listing.stencils) {
    if (builtinIdSet.has(stencil.id)) {
      throw new StencilInstallError(
        `Stencil id '${stencil.id}' conflicts with a built-in catalog entry`,
      );
    }
  }
  const root = userStencilPacksRoot(input.workspaceRoot);
  mkdirSync(root, { recursive: true });
  const path = packFilePath(input.workspaceRoot, listing.id);
  if (existsSync(path) && input.replace !== true) {
    throw new StencilInstallError(
      `Stencil pack '${listing.name}' already installed. Pass replace: true to overwrite.`,
    );
  }
  const now = new Date().toISOString();
  const file: UserStencilPackFile = UserStencilPackFileSchema.parse({
    listingId: listing.id,
    stencils: listing.stencils,
    provenance: {
      listingId: listing.id,
      catalogVersion: input.catalogVersion,
      trustTier: listing.trustTier,
      listingVersion: listing.version,
      installedAt: now,
      source: input.source ?? "catalog",
      kind: "stencil",
    },
  });
  writeFileSync(path, `${JSON.stringify(file, null, 2)}\n`, "utf8");
  refreshProjectStencilOverlay(input.workspaceRoot);
  return listing.stencils;
}

export function uninstallStencilFromListing(input: {
  workspaceRoot: string;
  listingId: string;
}): void {
  const path = packFilePath(input.workspaceRoot, input.listingId);
  if (!existsSync(path)) {
    throw new StencilInstallError(
      `Stencil listing '${input.listingId}' is not installed`,
    );
  }
  try {
    const parsed = UserStencilPackFileSchema.parse(
      JSON.parse(readFileSync(path, "utf8")),
    );
    if (!parsed.provenance) {
      throw new StencilInstallError(
        `Pack '${input.listingId}' is not a marketplace install`,
      );
    }
  } catch (error) {
    if (error instanceof StencilInstallError) throw error;
    throw new StencilInstallError(
      `Stencil listing '${input.listingId}' is not a valid marketplace install`,
    );
  }
  unlinkSync(path);
  refreshProjectStencilOverlay(input.workspaceRoot);
}

export function exportStencilPackFromIds(input: {
  stencilIds: string[];
  title?: string;
  description?: string;
  /** Extra defs (e.g. already-merged user catalog) beyond builtins. */
  resolveStencil?: (id: string) => StencilDefinition | undefined;
}): { listing: StencilCatalogListing; packJson: string } {
  const resolve =
    input.resolveStencil ?? ((id: string) => getBuiltinStencilById(id));
  const stencils: StencilDefinition[] = [];
  for (const id of input.stencilIds) {
    const def = resolve(id);
    if (!def) {
      throw new StencilInstallError(`Stencil '${id}' was not found`);
    }
    stencils.push(def);
  }
  const title =
    input.title?.trim() ||
    (stencils.length === 1
      ? stencils[0]!.title
      : `Stencil pack (${stencils.length})`);
  const slugBase = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 48);
  const short = stencils
    .map((s) => s.id.replace(/[^a-z0-9]/giu, "").slice(0, 6))
    .join("-")
    .slice(0, 24);
  const listing = StencilCatalogListingSchema.parse({
    id: `community.export.${slugBase || "stencils"}-${short || "pack"}`,
    name: title,
    description:
      input.description ??
      `Exported stencil pack: ${stencils.map((s) => s.title).join(", ")}`,
    trustTier: "community",
    version: "1.0.0",
    stencils,
  });
  return {
    listing,
    packJson: `${JSON.stringify({ kind: "stencil", listing }, null, 2)}\n`,
  };
}
