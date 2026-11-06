import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  ReminderTimelineDocumentSchema,
  emptyReminderTimeline,
  type ReminderTimelineDocument,
} from "../../contracts/reminder-graph.js";
import { reminderTimelinePath } from "./paths.js";
import { propagateReminderReadiness, sortReminderItems } from "./timeline-order.js";

export function readReminderTimeline(
  workspaceRoot: string,
): ReminderTimelineDocument {
  const path = reminderTimelinePath(workspaceRoot);
  if (!existsSync(path)) return emptyReminderTimeline();
  try {
    const parsed = ReminderTimelineDocumentSchema.parse(
      JSON.parse(readFileSync(path, "utf8")),
    );
    return normalizeTimeline(parsed);
  } catch {
    return emptyReminderTimeline();
  }
}

export function writeReminderTimeline(
  workspaceRoot: string,
  document: ReminderTimelineDocument,
): ReminderTimelineDocument {
  const normalized = normalizeTimeline(
    ReminderTimelineDocumentSchema.parse(document),
  );
  const path = reminderTimelinePath(workspaceRoot);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  return normalized;
}

export function normalizeTimeline(
  document: ReminderTimelineDocument,
  nowIso = new Date().toISOString(),
): ReminderTimelineDocument {
  const items = sortReminderItems(
    propagateReminderReadiness(document.items, nowIso),
  );
  return {
    ...document,
    version: 1,
    items,
    lastSyncChangelog: document.lastSyncChangelog ?? [],
    composerMode: document.composerMode ?? "ask",
    pendingEditOffer: document.pendingEditOffer ?? null,
  };
}

export function toTimelineSnapshot(document: ReminderTimelineDocument) {
  return {
    version: 1 as const,
    items: document.items,
    lastSyncedAt: document.lastSyncedAt ?? null,
    lastSyncChangelog: document.lastSyncChangelog ?? [],
    composerMode: document.composerMode ?? ("ask" as const),
  };
}
