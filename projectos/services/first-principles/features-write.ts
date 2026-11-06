import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import type {
  FirstPrinciplesFeatureWriteResult,
  FirstPrinciplesSession,
} from "../../contracts/first-principles.js";

type LooseFeature = {
  id: string;
  name: string;
  summary?: string;
  epicId?: string;
  status?: string;
  locked?: boolean;
  steps?: unknown[];
  thesisId?: string;
  [key: string]: unknown;
};

type LooseFeaturesFile = {
  version?: string;
  manifest?: Record<string, unknown>;
  epics?: Array<Record<string, unknown>>;
  features?: LooseFeature[];
  [key: string]: unknown;
};

export function featuresJsonPath(workspaceRoot: string): string {
  return join(workspaceRoot, ".projectos", "features.json");
}

function readFeaturesFile(workspaceRoot: string): LooseFeaturesFile {
  const path = featuresJsonPath(workspaceRoot);
  if (!existsSync(path)) {
    return {
      version: "0.1.0",
      manifest: {
        generated_at: new Date().toISOString(),
        generator: "projectos@first-principles",
      },
      epics: [],
      features: [],
    };
  }
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as LooseFeaturesFile;
    return {
      ...parsed,
      epics: Array.isArray(parsed.epics) ? parsed.epics : [],
      features: Array.isArray(parsed.features) ? parsed.features : [],
    };
  } catch {
    return {
      version: "0.1.0",
      manifest: {
        generated_at: new Date().toISOString(),
        generator: "projectos@first-principles",
      },
      epics: [],
      features: [],
    };
  }
}

/**
 * Append a planned feature from a concluded Go thesis.
 * Never overwrites `locked: true` features with the same id.
 */
export function writePlannedFeatureFromThesis(
  workspaceRoot: string,
  session: FirstPrinciplesSession,
): FirstPrinciplesFeatureWriteResult {
  if (session.status !== "concluded" || !session.thesis || session.thesis.verdict !== "go") {
    return {
      written: false,
      featureId: null,
      skippedLocked: false,
      message: "Only concluded go theses can write a planned feature",
    };
  }

  const path = featuresJsonPath(workspaceRoot);
  const doc = readFeaturesFile(workspaceRoot);
  const featureId =
    session.featuresFeatureId ??
    `f_fp_${session.id.replace(/^fp_/u, "").slice(0, 12)}`;

  const existing = (doc.features ?? []).find((feature) => feature.id === featureId);
  if (existing?.locked === true) {
    return {
      written: false,
      featureId,
      skippedLocked: true,
      path: ".projectos/features.json",
      message: "Existing feature is locked; left unchanged",
    };
  }

  const epicId = "epic_fp_inbox";
  const epics = [...(doc.epics ?? [])];
  if (!epics.some((epic) => epic.id === epicId)) {
    epics.push({
      id: epicId,
      name: "First Principles Inbox",
      summary: "Features promoted from Ask · First Principles theses",
      order: epics.length,
      importance: "normal",
    });
  }

  const feature: LooseFeature = {
    id: featureId,
    name: session.thesis.title.slice(0, 120),
    summary: session.thesis.thesis.slice(0, 400),
    epicId,
    status: "planned",
    locked: false,
    thesisId: session.id,
    mvp: session.thesis.mvp,
    successSignal: session.thesis.successSignal,
    nonGoals: session.thesis.nonGoals,
    steps: [
      {
        id: `${featureId}_mvp`,
        name: session.thesis.mvp.slice(0, 120),
        role: "transform",
        refs: [],
      },
    ],
  };

  const features = [...(doc.features ?? []).filter((item) => item.id !== featureId), feature];
  const next: LooseFeaturesFile = {
    ...doc,
    version: doc.version ?? "0.1.0",
    manifest: {
      ...(doc.manifest ?? {}),
      generated_at: new Date().toISOString(),
      generator: "projectos@first-principles",
    },
    epics,
    features,
  };

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(next, null, 2)}\n`, "utf8");

  return {
    written: true,
    featureId,
    skippedLocked: false,
    path: ".projectos/features.json",
    message: "Planned feature written",
  };
}
