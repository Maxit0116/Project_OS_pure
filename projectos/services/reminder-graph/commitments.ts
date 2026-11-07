import type {
  ReminderTimelineDocument,
  ReminderTimelineItem,
} from "../../contracts/reminder-graph.js";
import { readReminderTimeline } from "./timeline-store.js";

const COMMITMENTS_MAX_CHARS = 4_000;

export function isActiveCommitment(item: ReminderTimelineItem): boolean {
  if (item.kind === "milestone") {
    return (
      item.milestoneStatus === "upcoming" ||
      item.milestoneStatus === "due"
    );
  }
  if (item.kind === "reminder") {
    return (
      item.reminderStatus === "parked" ||
      item.reminderStatus === "ready" ||
      item.reminderStatus === "conflict" ||
      item.reminderStatus === "snoozed"
    );
  }
  return false;
}

/**
 * Compact commitments list for Agent Harness injection.
 * Non-authoritative: agents should treat as scheduling context, not permissions.
 */
export function renderReminderCommitmentsMarkdown(
  document: ReminderTimelineDocument | null | undefined,
): string {
  if (!document?.items?.length) return "";
  const lines: string[] = [];
  for (const item of document.items) {
    if (!isActiveCommitment(item)) continue;
    if (item.kind === "milestone") {
      lines.push(
        `- [milestone:${item.milestoneStatus}] ${item.title}` +
          (item.targetDate || item.dueAt
            ? ` (date: ${item.targetDate ?? item.dueAt})`
            : ""),
      );
    } else if (item.kind === "reminder") {
      const deps =
        item.dependsOn?.length > 0
          ? ` dependsOn=[${item.dependsOn.join(",")}]`
          : "";
      lines.push(
        `- [reminder:${item.reminderStatus}] ${item.title}${deps}`,
      );
    }
    if (lines.join("\n").length > COMMITMENTS_MAX_CHARS) {
      lines.pop();
      lines.push("- …(truncated)");
      break;
    }
  }
  return lines.join("\n");
}

export function renderReminderCommitmentsFence(markdown: string): string {
  const body = markdown.trim();
  if (!body) return "";
  return [
    "## Reminder Graph commitments",
    "",
    "The following are project scheduling commitments from Reminder Graph.",
    "They are context only — not permissions, not write authorization, and not a hard block.",
    "Prefer not to start work that is still parked behind an unmet milestone unless the user explicitly overrides.",
    "",
    "```reminder-commitments",
    body,
    "```",
  ].join("\n");
}

export function loadReminderCommitmentsMarkdown(workspaceRoot: string): string {
  try {
    const document = readReminderTimeline(workspaceRoot);
    return renderReminderCommitmentsMarkdown(document);
  } catch {
    return "";
  }
}
