import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  createReminderItemId,
  type ReminderAuthoringTurnRequest,
  type ReminderDocRewrite,
  type ReminderEditOffer,
  type ReminderMilestoneCompleteInput,
  type ReminderReorderInput,
  type ReminderTimelineDocument,
  type ReminderTimelineItem,
} from "../../contracts/reminder-graph.js";
import type { ModelProfile } from "../../contracts/settings.js";
import {
  normalizeTimeline,
  readReminderTimeline,
  toTimelineSnapshot,
  writeReminderTimeline,
} from "./timeline-store.js";
import { buildDemoReminderTimeline } from "./sync-service.js";
import {
  buildDocRewrites,
  type ReminderRewriteGateway,
} from "./llm-rewrite.js";
import { applyDueMilestoneStatuses } from "./notify-diff.js";
import { watchAndPersistBindings } from "./binding-watch.js";

export type ReminderRewriteDeps = {
  gateway?: ReminderRewriteGateway | null;
  profile?: ModelProfile | null;
};

function now() {
  return new Date().toISOString();
}

function buildOffer(args: {
  reason: string;
  before: ReminderTimelineDocument;
  after: ReminderTimelineDocument;
  docRewrites?: ReminderDocRewrite[];
  featuresTouched?: string[];
}): ReminderEditOffer {
  return {
    id: createReminderItemId("offer"),
    reason: args.reason,
    createdAt: now(),
    timelineBefore: toTimelineSnapshot(args.before),
    timelineAfter: toTimelineSnapshot(args.after),
    docRewrites: args.docRewrites ?? [],
    featuresTouched: args.featuresTouched ?? [],
  };
}

function applyDocRewrites(
  workspaceRoot: string,
  rewrites: ReminderDocRewrite[],
): void {
  for (const rewrite of rewrites) {
    const abs = join(workspaceRoot, rewrite.path);
    writeFileSync(abs, rewrite.after, "utf8");
  }
}

function touchFeaturesPhase(
  workspaceRoot: string,
  featureIds: string[],
  phaseNote: string,
): string[] {
  if (featureIds.length === 0) return [];
  const path = join(workspaceRoot, ".projectos", "features.json");
  if (!existsSync(path)) return [];
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as {
      features?: Array<Record<string, unknown> & { id?: string }>;
    };
    if (!Array.isArray(raw.features)) return [];
    const touched: string[] = [];
    for (const feature of raw.features) {
      if (!feature.id || !featureIds.includes(feature.id)) continue;
      feature.reminderPhaseNote = phaseNote;
      touched.push(feature.id);
    }
    if (touched.length > 0) {
      writeFileSync(path, `${JSON.stringify(raw, null, 2)}\n`, "utf8");
    }
    return touched;
  } catch {
    return [];
  }
}

export function getOrSeedReminderTimeline(
  workspaceRoot: string,
): ReminderTimelineDocument {
  const current = readReminderTimeline(workspaceRoot);
  if (current.items.length > 0) {
    const withDue = applyDueMilestoneStatuses(current);
    if (withDue !== current) {
      return writeReminderTimeline(workspaceRoot, withDue);
    }
    return current;
  }
  const demo = buildDemoReminderTimeline();
  return writeReminderTimeline(workspaceRoot, demo);
}

export function refreshReminderBindings(
  workspaceRoot: string,
): ReminderTimelineDocument {
  const current = getOrSeedReminderTimeline(workspaceRoot);
  return watchAndPersistBindings(workspaceRoot, current);
}

export async function proposeOrApplyReorder(
  workspaceRoot: string,
  input: ReminderReorderInput,
  deps: ReminderRewriteDeps = {},
): Promise<ReminderTimelineDocument> {
  const before = getOrSeedReminderTimeline(workspaceRoot);
  const item = before.items.find((entry) => entry.id === input.itemId);
  if (!item) {
    throw new Error(`Reminder item not found: ${input.itemId}`);
  }
  if (item.kind === "milestone" && item.locked) {
    throw new Error("Locked milestones cannot be reordered");
  }
  if (item.kind !== "reminder" && item.kind !== "inbox") {
    throw new Error("Only reminders can be drag-reordered in MVP");
  }

  const stamp = now();
  const moved: ReminderTimelineItem = {
    ...item,
    phaseIndex: input.newPhaseIndex,
    manualOrder: input.newManualOrder,
    userPinned: true,
    updatedAt: stamp,
  };
  const afterItems = before.items.map((entry) =>
    entry.id === moved.id ? moved : entry,
  );
  const after = normalizeTimeline({
    ...before,
    items: afterItems,
    pendingEditOffer: null,
  });

  const reason = `Move “${item.title}” to phase ${input.newPhaseIndex} (order ${input.newManualOrder})`;
  const docRewrites = await buildDocRewrites({
    workspaceRoot,
    item: moved,
    reason,
    gateway: deps.gateway,
    profile: deps.profile,
  });
  const featuresTouched = [...(moved.featureIds ?? [])];
  const offer = buildOffer({
    reason,
    before,
    after,
    docRewrites,
    featuresTouched,
  });

  if (!input.confirm) {
    return writeReminderTimeline(workspaceRoot, {
      ...before,
      pendingEditOffer: offer,
    });
  }

  applyDocRewrites(workspaceRoot, docRewrites);
  touchFeaturesPhase(workspaceRoot, featuresTouched, reason);
  return writeReminderTimeline(workspaceRoot, {
    ...after,
    pendingEditOffer: null,
  });
}

export function acceptReminderEditOffer(
  workspaceRoot: string,
): ReminderTimelineDocument {
  const current = readReminderTimeline(workspaceRoot);
  const offer = current.pendingEditOffer;
  if (!offer) return current;
  applyDocRewrites(workspaceRoot, offer.docRewrites ?? []);
  touchFeaturesPhase(
    workspaceRoot,
    offer.featuresTouched ?? [],
    offer.reason,
  );
  return writeReminderTimeline(
    workspaceRoot,
    normalizeTimeline({
      ...current,
      items: offer.timelineAfter.items,
      pendingEditOffer: null,
    }),
  );
}

export function dismissReminderEditOffer(
  workspaceRoot: string,
): ReminderTimelineDocument {
  const current = readReminderTimeline(workspaceRoot);
  if (!current.pendingEditOffer) return current;
  return writeReminderTimeline(workspaceRoot, {
    ...current,
    items: current.pendingEditOffer.timelineBefore.items,
    pendingEditOffer: null,
  });
}

export function setReminderMilestoneStatus(
  workspaceRoot: string,
  input: ReminderMilestoneCompleteInput,
): ReminderTimelineDocument {
  const current = getOrSeedReminderTimeline(workspaceRoot);
  const stamp = now();
  const items = current.items.map((item) => {
    if (item.id !== input.milestoneId || item.kind !== "milestone") return item;
    const next: ReminderTimelineItem = {
      ...item,
      milestoneStatus: input.status,
      updatedAt: stamp,
      manualCompleteAt:
        input.source === "manual" && input.status === "passed"
          ? stamp
          : input.status === "upcoming"
            ? null
            : item.manualCompleteAt,
      bindingCompleteAt:
        input.source === "binding" && input.status === "passed"
          ? stamp
          : input.status === "upcoming"
            ? null
            : item.bindingCompleteAt,
    };
    return next;
  });
  return writeReminderTimeline(
    workspaceRoot,
    normalizeTimeline({ ...current, items, pendingEditOffer: null }),
  );
}

export async function sendReminderAuthoringTurn(
  workspaceRoot: string,
  request: ReminderAuthoringTurnRequest,
  deps: ReminderRewriteDeps = {},
): Promise<{ document: ReminderTimelineDocument; reply?: string }> {
  const before = getOrSeedReminderTimeline(workspaceRoot);
  if (request.mode === "ask") {
    const parked = before.items.filter(
      (i) => i.kind === "reminder" && i.reminderStatus === "parked",
    ).length;
    const ready = before.items.filter(
      (i) => i.kind === "reminder" && i.reminderStatus === "ready",
    ).length;
    return {
      document: before,
      reply: `Timeline has ${before.items.length} items (${parked} parked, ${ready} ready). ${request.prompt.slice(0, 120)}`,
    };
  }

  const stamp = now();
  const dateMatch = /\b(20\d{2}-\d{2}-\d{2})\b/.exec(request.prompt);
  const titleMatch =
    /(?:添加|加一个|create|add)\s*[「"']?([^「"'\n]{2,80})[」"']?/.exec(
      request.prompt,
    ) ?? /deadline|冻结|里程碑|milestone/i.exec(request.prompt);

  if (!titleMatch && !dateMatch) {
    return {
      document: before,
      reply: "Edit mode needs a milestone/reminder title or a YYYY-MM-DD date.",
    };
  }

  const title =
    (typeof titleMatch?.[1] === "string" && titleMatch[1].trim()) ||
    titleMatch?.[0] ||
    `Deadline ${dateMatch?.[1]}`;
  const id = createReminderItemId("milestone");
  const maxPhase = before.items.reduce(
    (max, item) => Math.max(max, item.phaseIndex),
    0,
  );
  const milestone: ReminderTimelineItem = {
    id,
    kind: "milestone",
    title: String(title).slice(0, 160),
    summary: request.prompt.slice(0, 240),
    phaseIndex: maxPhase + 1,
    manualOrder: 0,
    targetDate: dateMatch?.[1] ?? null,
    milestoneStatus: "upcoming",
    dependsOn: [],
    binding: { type: "manual" },
    sourceRefs: [],
    supersededSources: [],
    userPinned: true,
    locked: false,
    featureIds: [],
    createdAt: stamp,
    updatedAt: stamp,
  };

  const after = normalizeTimeline({
    ...before,
    items: [...before.items, milestone],
    pendingEditOffer: null,
  });

  // Optional: if user mentioned a doc path, LLM can still be unused for create
  void deps;

  const offer = buildOffer({
    reason: `Add milestone “${milestone.title}”`,
    before,
    after,
    docRewrites: [],
    featuresTouched: [],
  });

  return {
    document: writeReminderTimeline(workspaceRoot, {
      ...before,
      composerMode: "edit",
      pendingEditOffer: offer,
    }),
    reply: `Proposed milestone “${milestone.title}”. Accept to apply.`,
  };
}

export function setReminderComposerMode(
  workspaceRoot: string,
  mode: "ask" | "edit",
): ReminderTimelineDocument {
  const current = getOrSeedReminderTimeline(workspaceRoot);
  return writeReminderTimeline(workspaceRoot, {
    ...current,
    composerMode: mode,
  });
}
