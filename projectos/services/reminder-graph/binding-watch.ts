import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import type {
  MilestoneBinding,
  ReminderTimelineDocument,
  ReminderTimelineItem,
} from "../../contracts/reminder-graph.js";
import { normalizeTimeline, writeReminderTimeline } from "./timeline-store.js";

export type BindingWatchContext = {
  tags: string[];
  features: Map<string, string>;
  /** loopId → best instance status (`complete` | `running` | `error` | `idle` | …) */
  loopStatuses: Map<string, string>;
  /** `${docPath}#${headingAnchor}` → whether checklist under heading is fully checked */
  checklists: Map<string, boolean>;
};

function listGitTags(workspaceRoot: string): string[] {
  try {
    const out = execFileSync("git", ["tag", "--list"], {
      cwd: workspaceRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5_000,
    });
    return out
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function matchTagPattern(tags: string[], pattern: string): string | null {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  const re = new RegExp(`^${escaped}$`);
  return tags.find((tag) => re.test(tag)) ?? null;
}

function readFeatureStatuses(workspaceRoot: string): Map<string, string> {
  const path = join(workspaceRoot, ".projectos", "features.json");
  const out = new Map<string, string>();
  if (!existsSync(path)) return out;
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as {
      features?: Array<{ id?: string; status?: string }>;
    };
    for (const feature of raw.features ?? []) {
      if (feature.id && feature.status) out.set(feature.id, feature.status);
    }
  } catch {
    /* ignore corrupt features.json */
  }
  return out;
}

/**
 * Read `.projectos/loop-graphs/*.json` and map loopId → best instance status.
 * Contract binding uses `requireStatus: "succeeded"` which maps to Loop `complete`.
 */
export function readLoopStatuses(workspaceRoot: string): Map<string, string> {
  const out = new Map<string, string>();
  const dir = join(workspaceRoot, ".projectos", "loop-graphs");
  if (!existsSync(dir)) return out;
  let files: string[] = [];
  try {
    files = readdirSync(dir).filter((name) => name.endsWith(".json") && name !== "index.json");
  } catch {
    return out;
  }
  const rank: Record<string, number> = {
    complete: 4,
    succeeded: 4,
    running: 3,
    error: 2,
    idle: 1,
  };
  for (const file of files) {
    const abs = join(dir, file);
    try {
      const raw = JSON.parse(readFileSync(abs, "utf8")) as {
        id?: string;
        instances?: Array<{ status?: string }>;
      };
      const loopId = raw.id ?? file.replace(/\.json$/i, "");
      let best = "idle";
      let bestRank = 0;
      for (const instance of raw.instances ?? []) {
        const status = (instance.status ?? "idle").toLowerCase();
        const r = rank[status] ?? 0;
        if (r > bestRank) {
          bestRank = r;
          best = status;
        }
      }
      out.set(loopId, best);
    } catch {
      /* skip corrupt loop file */
    }
  }
  return out;
}

function normalizeHeading(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^#+\s*/, "")
    .replace(/[^\p{L}\p{N}\s_-]+/gu, "")
    .replace(/\s+/g, " ");
}

/**
 * Under a markdown heading, all task list items must be checked (`[x]` / `[X]`).
 * Empty checklist sections are not satisfied.
 */
export function isChecklistHeadingComplete(
  markdown: string,
  headingAnchor: string,
): boolean {
  const target = normalizeHeading(headingAnchor);
  if (!target) return false;
  const lines = markdown.split(/\r?\n/);
  let inSection = false;
  let sawItem = false;
  let allChecked = true;

  for (const line of lines) {
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      const current = normalizeHeading(heading[2] ?? "");
      if (inSection) break;
      if (current === target || current.includes(target) || target.includes(current)) {
        inSection = true;
      }
      continue;
    }
    if (!inSection) continue;
    const item = /^\s*[-*+]\s+\[([ xX])\]\s+/.exec(line);
    if (!item) continue;
    sawItem = true;
    if (item[1] === " ") allChecked = false;
  }

  return sawItem && allChecked;
}

export function checklistKey(docPath: string, headingAnchor: string): string {
  return `${docPath}#${headingAnchor}`;
}

export function readChecklistStatuses(
  workspaceRoot: string,
  bindings: MilestoneBinding[],
): Map<string, boolean> {
  const out = new Map<string, boolean>();
  for (const binding of bindings) {
    if (binding.type !== "checklist") continue;
    const key = checklistKey(binding.docPath, binding.headingAnchor);
    if (out.has(key)) continue;
    const abs = join(workspaceRoot, binding.docPath);
    if (!existsSync(abs)) {
      out.set(key, false);
      continue;
    }
    try {
      const text = readFileSync(abs, "utf8");
      out.set(key, isChecklistHeadingComplete(text, binding.headingAnchor));
    } catch {
      out.set(key, false);
    }
  }
  return out;
}

export function buildBindingWatchContext(
  workspaceRoot: string,
  document?: ReminderTimelineDocument,
): BindingWatchContext {
  const checklistBindings = (document?.items ?? [])
    .map((item) => item.binding)
    .filter((binding): binding is MilestoneBinding => Boolean(binding));
  return {
    tags: listGitTags(workspaceRoot),
    features: readFeatureStatuses(workspaceRoot),
    loopStatuses: readLoopStatuses(workspaceRoot),
    checklists: readChecklistStatuses(workspaceRoot, checklistBindings),
  };
}

function loopStatusMatchesRequired(
  status: string | undefined,
  requireStatus: "succeeded",
): boolean {
  if (!status) return false;
  const normalized = status.toLowerCase();
  if (requireStatus === "succeeded") {
    return normalized === "succeeded" || normalized === "complete";
  }
  return false;
}

export function bindingSatisfied(
  binding: MilestoneBinding | undefined,
  ctx: BindingWatchContext,
): boolean {
  if (!binding || binding.type === "manual") return false;
  if (binding.type === "git_tag") {
    return matchTagPattern(ctx.tags, binding.tagPattern) !== null;
  }
  if (binding.type === "feature_acceptance") {
    const status = ctx.features.get(binding.featureId)?.toLowerCase();
    return status === "implemented" || status === "accepted" || status === "done";
  }
  if (binding.type === "loop_run") {
    return loopStatusMatchesRequired(
      ctx.loopStatuses.get(binding.loopId),
      binding.requireStatus,
    );
  }
  if (binding.type === "checklist") {
    return (
      ctx.checklists.get(checklistKey(binding.docPath, binding.headingAnchor)) ===
      true
    );
  }
  return false;
}

/**
 * Apply automatic milestone completion from bindings.
 * Manual completions are preserved; bindingCompleteAt is set when binding fires.
 * Binding-only passes are revoked when the binding no longer holds.
 */
export function applyBindingWatch(
  document: ReminderTimelineDocument,
  workspaceRoot: string,
  nowIso = new Date().toISOString(),
  options?: Partial<BindingWatchContext>,
): ReminderTimelineDocument {
  const base = buildBindingWatchContext(workspaceRoot, document);
  const ctx: BindingWatchContext = {
    tags: options?.tags ?? base.tags,
    features: options?.features ?? base.features,
    loopStatuses: options?.loopStatuses ?? base.loopStatuses,
    checklists: options?.checklists ?? base.checklists,
  };
  let changed = false;

  const items: ReminderTimelineItem[] = document.items.map((item) => {
    if (item.kind !== "milestone") return item;
    if (item.milestoneStatus === "waived") return item;

    const satisfied = bindingSatisfied(item.binding, ctx);

    if (item.milestoneStatus === "passed") {
      if (item.bindingCompleteAt && !item.manualCompleteAt && !satisfied) {
        changed = true;
        return {
          ...item,
          milestoneStatus: "upcoming",
          bindingCompleteAt: null,
          updatedAt: nowIso,
        };
      }
      return item;
    }

    if (!satisfied) return item;
    changed = true;
    return {
      ...item,
      milestoneStatus: "passed",
      bindingCompleteAt: nowIso,
      updatedAt: nowIso,
    };
  });

  if (!changed) return document;
  return normalizeTimeline({ ...document, items }, nowIso);
}

export function watchAndPersistBindings(
  workspaceRoot: string,
  document: ReminderTimelineDocument,
  nowIso = new Date().toISOString(),
): ReminderTimelineDocument {
  const next = applyBindingWatch(document, workspaceRoot, nowIso);
  if (next === document) return document;
  return writeReminderTimeline(workspaceRoot, next);
}
