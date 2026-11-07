import type { ReminderTimelineItem } from "../../contracts/reminder-graph.js";

function dateKey(value: string | null | undefined): number {
  if (!value) return Number.POSITIVE_INFINITY;
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY;
}

/** Hybrid axis: phaseIndex → manualOrder → targetDate → updatedAt. */
export function compareReminderItems(
  a: ReminderTimelineItem,
  b: ReminderTimelineItem,
): number {
  if (a.phaseIndex !== b.phaseIndex) return a.phaseIndex - b.phaseIndex;
  if (a.manualOrder !== b.manualOrder) return a.manualOrder - b.manualOrder;
  const da = dateKey(a.targetDate ?? a.dueAt);
  const db = dateKey(b.targetDate ?? b.dueAt);
  if (da !== db) return da - db;
  return a.updatedAt.localeCompare(b.updatedAt);
}

export function sortReminderItems(
  items: ReminderTimelineItem[],
): ReminderTimelineItem[] {
  return [...items].sort(compareReminderItems);
}

export function isMilestonePassed(item: ReminderTimelineItem): boolean {
  return item.kind === "milestone" && item.milestoneStatus === "passed";
}

/**
 * Propagate reminder readiness from milestone dependency satisfaction.
 * Respects done/dropped/snoozed/conflict; does not clear userPinned done.
 */
export function propagateReminderReadiness(
  items: ReminderTimelineItem[],
  nowIso: string,
): ReminderTimelineItem[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  return items.map((item) => {
    if (item.kind !== "reminder") return item;
    if (
      item.reminderStatus === "done" ||
      item.reminderStatus === "dropped" ||
      item.reminderStatus === "conflict"
    ) {
      return item;
    }
    if (
      item.reminderStatus === "snoozed" &&
      item.snoozeUntil &&
      Date.parse(item.snoozeUntil) > Date.parse(nowIso)
    ) {
      return item;
    }
    const deps = item.dependsOn ?? [];
    if (deps.length === 0) {
      return item.reminderStatus === "ready"
        ? item
        : { ...item, reminderStatus: "parked", updatedAt: nowIso };
    }
    const allPassed = deps.every((id) => {
      const dep = byId.get(id);
      return dep ? isMilestonePassed(dep) : false;
    });
    if (allPassed && item.reminderStatus !== "ready") {
      return { ...item, reminderStatus: "ready", updatedAt: nowIso };
    }
    if (!allPassed && item.reminderStatus === "ready" && !item.userPinned) {
      return { ...item, reminderStatus: "parked", updatedAt: nowIso };
    }
    return item;
  });
}
