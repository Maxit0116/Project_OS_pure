import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  ModelHarnessDocumentSchema,
  type ModelHarnessDocument,
  type ModelHarnessVariant,
} from "../../contracts/model-harness.js";
import type { ModelProfile } from "../../contracts/settings.js";
import { matchPermissionGlob } from "./permissions.js";

const MODEL_HARNESS_FILE = ".projectos/model-harness.json";

export function loadModelHarnessDocument(
  workspaceRoot: string,
): ModelHarnessDocument {
  const absolute = join(workspaceRoot, MODEL_HARNESS_FILE);
  if (!existsSync(absolute)) {
    return { version: "0.1.0", variants: [] };
  }
  try {
    const raw = JSON.parse(readFileSync(absolute, "utf8")) as unknown;
    return ModelHarnessDocumentSchema.parse(raw);
  } catch {
    return { version: "0.1.0", variants: [] };
  }
}

function variantMatches(
  variant: ModelHarnessVariant,
  profile: ModelProfile,
): boolean {
  const { match } = variant;
  if (match.modelProfileId && match.modelProfileId !== profile.id) {
    return false;
  }
  if (match.provider && match.provider !== profile.provider) {
    return false;
  }
  if (match.model && !matchPermissionGlob(match.model, profile.model)) {
    return false;
  }
  return Boolean(match.modelProfileId || match.provider || match.model);
}

/** First matching variant wins (document order). */
export function resolveModelHarnessVariant(
  profile: ModelProfile,
  document?: ModelHarnessDocument,
  workspaceRoot?: string,
): ModelHarnessVariant | undefined {
  const doc =
    document ??
    (workspaceRoot
      ? loadModelHarnessDocument(workspaceRoot)
      : { version: "0.1.0" as const, variants: [] });
  return doc.variants.find((variant) => variantMatches(variant, profile));
}

export function modelHarnessSystemDelta(
  profile: ModelProfile | undefined,
  workspaceRoot: string,
): string | undefined {
  if (!profile) return undefined;
  const variant = resolveModelHarnessVariant(profile, undefined, workspaceRoot);
  const delta = variant?.systemDelta?.trim();
  return delta || undefined;
}
