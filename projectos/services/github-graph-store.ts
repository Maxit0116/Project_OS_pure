import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  EMPTY_GITHUB_GRAPH_STORE,
  GithubGraphStoreDocumentSchema,
  type GithubGraphStoreDocument,
} from "../contracts/github-graph-store.js";
import type { GithubFeature, GithubRelation } from "../contracts/github-domain.js";

const STORE_DIR = ".projectos/github-graph";
const STORE_FILE = "features.json";

function storeDir(workspaceRoot: string): string {
  return join(workspaceRoot, STORE_DIR);
}

function storePath(workspaceRoot: string): string {
  return join(storeDir(workspaceRoot), STORE_FILE);
}

export function loadGithubGraphStore(
  workspaceRoot: string,
): GithubGraphStoreDocument {
  const absolute = storePath(workspaceRoot);
  if (!existsSync(absolute)) {
    return { ...EMPTY_GITHUB_GRAPH_STORE, features: [], relations: [] };
  }
  try {
    return GithubGraphStoreDocumentSchema.parse(
      JSON.parse(readFileSync(absolute, "utf8")) as unknown,
    );
  } catch {
    return { ...EMPTY_GITHUB_GRAPH_STORE, features: [], relations: [] };
  }
}

export function saveGithubGraphStore(
  workspaceRoot: string,
  document: GithubGraphStoreDocument,
): GithubGraphStoreDocument {
  const parsed = GithubGraphStoreDocumentSchema.parse({
    ...document,
    updatedAt: new Date().toISOString(),
  });
  mkdirSync(storeDir(workspaceRoot), { recursive: true });
  writeFileSync(
    storePath(workspaceRoot),
    `${JSON.stringify(parsed, null, 2)}\n`,
    "utf8",
  );
  return parsed;
}

export function upsertGithubGraphFeature(
  workspaceRoot: string,
  feature: GithubFeature,
): GithubGraphStoreDocument {
  const current = loadGithubGraphStore(workspaceRoot);
  const nextFeatures = current.features.filter((item) => item.id !== feature.id);
  nextFeatures.push(feature);
  return saveGithubGraphStore(workspaceRoot, {
    ...current,
    features: nextFeatures,
  });
}

export function deleteGithubGraphFeature(
  workspaceRoot: string,
  featureId: string,
): GithubGraphStoreDocument {
  const current = loadGithubGraphStore(workspaceRoot);
  return saveGithubGraphStore(workspaceRoot, {
    ...current,
    features: current.features.filter((item) => item.id !== featureId),
    relations: current.relations.filter(
      (rel) =>
        !(
          (rel.fromType === "feature" && rel.fromKey === featureId) ||
          (rel.toType === "feature" && rel.toKey === featureId)
        ),
    ),
  });
}

export function upsertGithubGraphRelation(
  workspaceRoot: string,
  relation: GithubRelation,
): GithubGraphStoreDocument {
  const current = loadGithubGraphStore(workspaceRoot);
  const next = current.relations.filter((item) => item.id !== relation.id);
  // Also drop duplicate same-kind edges for the same endpoints.
  const deduped = next.filter(
    (item) =>
      !(
        item.kind === relation.kind &&
        item.fromType === relation.fromType &&
        item.fromKey === relation.fromKey &&
        item.toType === relation.toType &&
        item.toKey === relation.toKey
      ),
  );
  deduped.push(relation);
  return saveGithubGraphStore(workspaceRoot, {
    ...current,
    relations: deduped,
  });
}

export function removeGithubGraphRelation(
  workspaceRoot: string,
  relationId: string,
): GithubGraphStoreDocument {
  const current = loadGithubGraphStore(workspaceRoot);
  return saveGithubGraphStore(workspaceRoot, {
    ...current,
    relations: current.relations.filter((item) => item.id !== relationId),
  });
}
