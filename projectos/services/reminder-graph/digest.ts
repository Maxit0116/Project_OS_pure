import type {
  ReminderNotifyEvent,
  ReminderTimelineDocument,
} from "../../contracts/reminder-graph.js";

export type ReminderDigestSummary = {
  readyCount: number;
  dueCount: number;
  conflictCount: number;
  overdueReminderCount: number;
  events: ReminderNotifyEvent[];
};

function localDateKey(nowMs: number, timeZone?: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timeZone || undefined,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(nowMs));
  } catch {
    return new Date(nowMs).toISOString().slice(0, 10);
  }
}

/** True when we have not yet sent today's digest (local calendar day). */
export function shouldSendReminderDigest(args: {
  lastDigestLocalDate: string | null | undefined;
  nowMs?: number;
  timeZone?: string;
}): boolean {
  const today = localDateKey(args.nowMs ?? Date.now(), args.timeZone);
  return args.lastDigestLocalDate !== today;
}

export function currentLocalDateKey(nowMs = Date.now(), timeZone?: string): string {
  return localDateKey(nowMs, timeZone);
}

/**
 * Build a once-per-day digest of actionable Reminder Graph items.
 * Emits a single `digest` event when there is something worth reminding.
 */
export function buildReminderDigest(
  document: ReminderTimelineDocument | null | undefined,
  nowMs = Date.now(),
): ReminderDigestSummary {
  const empty: ReminderDigestSummary = {
    readyCount: 0,
    dueCount: 0,
    conflictCount: 0,
    overdueReminderCount: 0,
    events: [],
  };
  if (!document?.items?.length) return empty;

  const ready: string[] = [];
  const due: string[] = [];
  const conflicts: string[] = [];
  const overdue: string[] = [];

  for (const item of document.items) {
    if (item.kind === "milestone" && item.milestoneStatus === "due") {
      due.push(item.title);
    }
    if (item.kind === "reminder" && item.reminderStatus === "ready") {
      ready.push(item.title);
    }
    if (item.kind === "reminder" && item.reminderStatus === "conflict") {
      conflicts.push(item.title);
    }
    if (item.kind === "reminder") {
      const date = item.dueAt ?? item.targetDate;
      if (
        date &&
        Date.parse(date) < nowMs &&
        item.reminderStatus !== "done" &&
        item.reminderStatus !== "dropped"
      ) {
        overdue.push(item.title);
      }
    }
  }

  const parts: string[] = [];
  if (ready.length) parts.push(`${ready.length} ready to start`);
  if (due.length) parts.push(`${due.length} milestone(s) due`);
  if (overdue.length) parts.push(`${overdue.length} overdue`);
  if (conflicts.length) parts.push(`${conflicts.length} conflict(s)`);

  if (parts.length === 0) {
    return {
      readyCount: 0,
      dueCount: 0,
      conflictCount: 0,
      overdueReminderCount: 0,
      events: [],
    };
  }

  const samples = [...ready, ...due, ...overdue, ...conflicts]
    .slice(0, 3)
    .join(" · ");

  const event: ReminderNotifyEvent = {
    kind: "digest",
    itemId: "digest_daily",
    title: "Reminder Graph daily digest",
    body: `${parts.join(", ")}${samples ? `: ${samples}` : ""}`.slice(0, 1000),
  };

  return {
    readyCount: ready.length,
    dueCount: due.length,
    conflictCount: conflicts.length,
    overdueReminderCount: overdue.length,
    events: [event],
  };
}
