import type {
  ReminderNotifyEvent,
  ReminderTimelineDocument,
  ReminderTimelineItem,
} from "../../contracts/reminder-graph.js";

function byId(items: ReminderTimelineItem[]): Map<string, ReminderTimelineItem> {
  return new Map(items.map((item) => [item.id, item]));
}

/**
 * Diff two timeline snapshots into user-facing notification events.
 * Used by the workbench after sync / milestone complete / accept offer.
 */
export function diffReminderNotifications(
  before: ReminderTimelineDocument | null | undefined,
  after: ReminderTimelineDocument | null | undefined,
): ReminderNotifyEvent[] {
  if (!after) return [];
  const prev = byId(before?.items ?? []);
  const events: ReminderNotifyEvent[] = [];

  for (const item of after.items) {
    const older = prev.get(item.id);

    if (
      item.kind === "milestone" &&
      item.milestoneStatus === "passed" &&
      older?.milestoneStatus !== "passed"
    ) {
      events.push({
        kind: "milestone_passed",
        itemId: item.id,
        title: item.title,
        body: `Milestone passed: ${item.title}`,
      });
    }

    if (
      item.kind === "milestone" &&
      item.milestoneStatus === "due" &&
      older?.milestoneStatus !== "due"
    ) {
      events.push({
        kind: "milestone_due",
        itemId: item.id,
        title: item.title,
        body: `Milestone due: ${item.title}`,
      });
    }

    if (
      item.kind === "reminder" &&
      item.reminderStatus === "ready" &&
      older?.reminderStatus !== "ready"
    ) {
      events.push({
        kind: "reminder_ready",
        itemId: item.id,
        title: item.title,
        body: `Ready to start: ${item.title}`,
      });
    }

    if (
      item.kind === "reminder" &&
      item.reminderStatus === "conflict" &&
      older?.reminderStatus !== "conflict"
    ) {
      events.push({
        kind: "conflict",
        itemId: item.id,
        title: item.title,
        body: item.conflictNote?.slice(0, 240) || `Conflict on: ${item.title}`,
      });
    }
  }

  return events;
}

/** Mark milestones with targetDate/dueAt in the past as due (without completing them). */
export function applyDueMilestoneStatuses(
  document: ReminderTimelineDocument,
  nowMs = Date.now(),
): ReminderTimelineDocument {
  const nowIso = new Date(nowMs).toISOString();
  let changed = false;
  const items = document.items.map((item) => {
    if (item.kind !== "milestone") return item;
    if (item.milestoneStatus === "passed" || item.milestoneStatus === "waived") {
      return item;
    }
    const due = item.dueAt ?? item.targetDate;
    if (!due) return item;
    const t = Date.parse(due);
    if (!Number.isFinite(t) || t > nowMs) return item;
    if (item.milestoneStatus === "due") return item;
    changed = true;
    return { ...item, milestoneStatus: "due" as const, updatedAt: nowIso };
  });
  return changed ? { ...document, items } : document;
}
