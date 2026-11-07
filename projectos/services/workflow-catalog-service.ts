import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

import type { IntentGraph } from "../contracts/loop-graph.js";
import { IntentGraphSchema } from "../contracts/loop-graph.js";
import {
  LoopGraphPresetSchema,
  type LoopGraphPreset,
} from "../contracts/loop-presets.js";
import {
  LOOP_GRAPH_PRESETS,
  getLoopGraphPreset as getBuiltinLoopGraphPreset,
} from "../contracts/loop-presets.js";
import {
  UserLoopPresetFileSchema,
  WorkflowCatalogListingSchema,
  type UserLoopPresetFile,
  type WorkflowCatalogListing,
} from "../contracts/workflow-marketplace.js";

export class WorkflowInstallError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkflowInstallError";
  }
}

const PRESETS_DIR = join(".projectos", "loop-presets");

export function safeWorkflowInstallId(listingId: string): string {
  const slug = listingId
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 80);
  if (!slug || slug === "." || slug === ".." || slug.includes("..")) {
    throw new WorkflowInstallError(`Invalid workflow listing id '${listingId}'`);
  }
  return slug;
}

export function userLoopPresetsRoot(workspaceRoot: string): string {
  return join(workspaceRoot, PRESETS_DIR);
}

function presetFilePath(workspaceRoot: string, presetId: string): string {
  return join(userLoopPresetsRoot(workspaceRoot), `${safeWorkflowInstallId(presetId)}.json`);
}

/** Strip session / project bindings before packing or installing. */
export function sanitizeIntentGraphForPack(draft: IntentGraph): IntentGraph {
  return IntentGraphSchema.parse({
    revision: 1,
    graphPrompt: draft.graphPrompt,
    nodes: draft.nodes.map((node) => {
      const {
        authoringSessionId: _session,
        agentDefinitionId: _agent,
        ...rest
      } = node;
      return rest;
    }),
    edges: draft.edges.map((edge) => {
      const { authoringSessionId: _session, ...rest } = edge;
      return rest;
    }),
  });
}

export function listingToLoopGraphPreset(
  listing: WorkflowCatalogListing,
): LoopGraphPreset {
  return LoopGraphPresetSchema.parse({
    id: safeWorkflowInstallId(listing.id),
    title: listing.name,
    description: listing.description ?? listing.name,
    draft: sanitizeIntentGraphForPack(listing.draft),
  });
}

export function listUserLoopGraphPresets(workspaceRoot: string): LoopGraphPreset[] {
  const root = userLoopPresetsRoot(workspaceRoot);
  if (!existsSync(root)) return [];
  const out: LoopGraphPreset[] = [];
  for (const name of readdirSync(root)) {
    if (!name.endsWith(".json")) continue;
    try {
      const raw = JSON.parse(readFileSync(join(root, name), "utf8"));
      const parsed = UserLoopPresetFileSchema.safeParse(raw);
      if (parsed.success) out.push(parsed.data.preset);
    } catch {
      // skip corrupt
    }
  }
  return out.sort((a, b) => a.title.localeCompare(b.title));
}

export function listInstalledWorkflowListingIds(workspaceRoot: string): string[] {
  const root = userLoopPresetsRoot(workspaceRoot);
  if (!existsSync(root)) return [];
  const ids: string[] = [];
  for (const name of readdirSync(root)) {
    if (!name.endsWith(".json")) continue;
    try {
      const raw = JSON.parse(readFileSync(join(root, name), "utf8"));
      const parsed = UserLoopPresetFileSchema.safeParse(raw);
      if (!parsed.success) continue;
      if (parsed.data.provenance?.listingId) {
        ids.push(parsed.data.provenance.listingId);
      } else {
        ids.push(parsed.data.preset.id);
      }
    } catch {
      // skip
    }
  }
  return [...new Set(ids)].sort((a, b) => a.localeCompare(b));
}

export function resolveLoopGraphPreset(
  workspaceRoot: string,
  presetId: string,
): LoopGraphPreset | null {
  const builtin = getBuiltinLoopGraphPreset(presetId);
  if (builtin) return builtin;
  const path = presetFilePath(workspaceRoot, presetId);
  if (!existsSync(path)) {
    // also try raw id file name
    const alt = join(userLoopPresetsRoot(workspaceRoot), `${presetId}.json`);
    if (!existsSync(alt)) return null;
    try {
      const parsed = UserLoopPresetFileSchema.parse(
        JSON.parse(readFileSync(alt, "utf8")),
      );
      return parsed.preset;
    } catch {
      return null;
    }
  }
  try {
    const parsed = UserLoopPresetFileSchema.parse(
      JSON.parse(readFileSync(path, "utf8")),
    );
    return parsed.preset;
  } catch {
    return null;
  }
}

export function listMergedLoopGraphPresets(workspaceRoot: string): {
  builtins: LoopGraphPreset[];
  user: LoopGraphPreset[];
} {
  return {
    builtins: [...LOOP_GRAPH_PRESETS],
    user: listUserLoopGraphPresets(workspaceRoot),
  };
}

export function installWorkflowFromListing(input: {
  workspaceRoot: string;
  listing: WorkflowCatalogListing;
  catalogVersion: string;
  source?: "catalog" | "export-reimport" | "git-url";
  replace?: boolean;
}): LoopGraphPreset {
  const listing = WorkflowCatalogListingSchema.parse(input.listing);
  const preset = listingToLoopGraphPreset(listing);
  const root = userLoopPresetsRoot(input.workspaceRoot);
  mkdirSync(root, { recursive: true });
  const path = presetFilePath(input.workspaceRoot, listing.id);
  if (existsSync(path) && input.replace !== true) {
    throw new WorkflowInstallError(
      `Workflow preset '${preset.title}' already installed. Pass replace: true to overwrite.`,
    );
  }
  const now = new Date().toISOString();
  const file: UserLoopPresetFile = UserLoopPresetFileSchema.parse({
    preset,
    provenance: {
      listingId: listing.id,
      catalogVersion: input.catalogVersion,
      trustTier: listing.trustTier,
      listingVersion: listing.version,
      installedAt: now,
      source: input.source ?? "catalog",
      kind: "workflow",
    },
  });
  writeFileSync(path, `${JSON.stringify(file, null, 2)}\n`, "utf8");
  return preset;
}

export function uninstallWorkflowFromListing(input: {
  workspaceRoot: string;
  listingId: string;
}): void {
  const path = presetFilePath(input.workspaceRoot, input.listingId);
  if (!existsSync(path)) {
    throw new WorkflowInstallError(
      `Workflow listing '${input.listingId}' is not installed`,
    );
  }
  try {
    const parsed = UserLoopPresetFileSchema.parse(
      JSON.parse(readFileSync(path, "utf8")),
    );
    if (!parsed.provenance) {
      throw new WorkflowInstallError(
        `Preset '${input.listingId}' is not a marketplace install`,
      );
    }
  } catch (error) {
    if (error instanceof WorkflowInstallError) throw error;
    throw new WorkflowInstallError(
      `Workflow listing '${input.listingId}' is not a valid marketplace install`,
    );
  }
  unlinkSync(path);
}

export function exportWorkflowPackFromDraft(input: {
  title: string;
  description?: string;
  draft: IntentGraph;
  sourceLoopId?: string;
}): { listing: WorkflowCatalogListing; packJson: string } {
  const slugBase = input.title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 48);
  const short = (input.sourceLoopId ?? "loop").replace(/[^a-z0-9]/giu, "").slice(0, 8);
  const listing = WorkflowCatalogListingSchema.parse({
    id: `community.export.${slugBase || "workflow"}-${short || "pack"}`,
    name: input.title.trim() || "Exported workflow",
    description: input.description ?? `Exported loop workflow ${input.title}`,
    trustTier: "community",
    version: "1.0.0",
    draft: sanitizeIntentGraphForPack(input.draft),
  });
  return {
    listing,
    packJson: `${JSON.stringify({ kind: "workflow", listing }, null, 2)}\n`,
  };
}
