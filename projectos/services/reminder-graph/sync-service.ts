import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import {
  createReminderItemId,
  type ReminderSourceRef,
  type ReminderTimelineDocument,
  type ReminderTimelineItem,
} from "../../contracts/reminder-graph.js";
import { reminderDocsGlobRoots } from "./paths.js";
import { applyBindingWatch } from "./binding-watch.js";
import { applyDueMilestoneStatuses } from "./notify-diff.js";
import { normalizeTimeline, readReminderTimeline, writeReminderTimeline } from "./timeline-store.js";

type ExtractedGate = {
  title: string;
  kind: "milestone" | "reminder";
  dependsOnTitle?: string | undefined;
  targetDate?: string | undefined;
  excerpt: string;
  path: string;
  heading?: string | undefined;
};

const DATE_RE = /\b(20\d{2}-\d{2}-\d{2})\b/;
const AFTER_RE =
  /(?:在|after|一旦|等到)\s*[「"']?([^「"'\n]{2,80}?)[」"']?\s*(?:之后|以后|完成|验收|后再|后再进行|后再开发|后再做)/i;
const DEFER_RE =
  /(?:延期|延后|暂不|以后再|MVP\s*后|验收后|推向市场后|phase\s*\d+\s*后)[^\n]{0,120}/i;
const MILESTONE_RE =
  /(?:MVP\s*验收|v\d+\s*(?:推向市场|发布|上线)|功能[^。\n]{0,40}完成|冻结日|deadline|里程碑)[^\n]{0,80}/i;

function listMarkdownFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (entry.startsWith(".")) continue;
      const full = join(dir, entry);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        if (entry === "node_modules" || entry === "backend") continue;
        walk(full);
      } else if (/\.(md|markdown)$/i.test(entry)) {
        out.push(full);
      }
    }
  };
  walk(root);
  return out;
}

function extractFromMarkdown(
  workspaceRoot: string,
  absPath: string,
  text: string,
): ExtractedGate[] {
  const rel = relative(workspaceRoot, absPath).replaceAll("\\", "/");
  const lines = text.split(/\r?\n/);
  const found: ExtractedGate[] = [];
  let heading: string | undefined;

  for (const line of lines) {
    const headingMatch = /^(#{1,3})\s+(.+)$/.exec(line);
    if (headingMatch) {
      heading = headingMatch[2]?.trim();
    }

    const dateMatch = DATE_RE.exec(line);
    const milestoneMatch = MILESTONE_RE.exec(line);
    if (milestoneMatch) {
      const title = milestoneMatch[0].replace(/\s+/g, " ").trim().slice(0, 120);
      found.push({
        title,
        kind: "milestone",
        targetDate: dateMatch?.[1],
        excerpt: line.trim().slice(0, 240),
        path: rel,
        heading,
      });
    }

    const afterMatch = AFTER_RE.exec(line);
    const deferMatch = DEFER_RE.exec(line);
    if (afterMatch || deferMatch) {
      const titleBase =
        deferMatch?.[0] ??
        afterMatch?.[0] ??
        line.trim();
      const title = titleBase.replace(/\s+/g, " ").trim().slice(0, 160);
      found.push({
        title,
        kind: "reminder",
        dependsOnTitle: afterMatch?.[1]?.trim(),
        targetDate: dateMatch?.[1],
        excerpt: line.trim().slice(0, 240),
        path: rel,
        heading,
      });
    }
  }

  return found;
}

function sourceRef(gate: ExtractedGate, updatedAt: string): ReminderSourceRef {
  return {
    path: gate.path,
    heading: gate.heading,
    excerpt: gate.excerpt,
    updatedAt,
  };
}

function stableId(kind: string, path: string, title: string): string {
  const raw = `${kind}:${path}:${title}`.toLowerCase();
  let hash = 0;
  for (let i = 0; i < raw.length; i += 1) {
    hash = (hash * 31 + raw.charCodeAt(i)) | 0;
  }
  return `${kind}_${Math.abs(hash).toString(36)}`;
}

function findMilestoneIdByTitle(
  items: ReminderTimelineItem[],
  titleHint: string | undefined,
): string | undefined {
  if (!titleHint) return undefined;
  const needle = titleHint.toLowerCase();
  const hit = items.find(
    (item) =>
      item.kind === "milestone" &&
      (item.title.toLowerCase().includes(needle) ||
        needle.includes(item.title.toLowerCase().slice(0, 12))),
  );
  return hit?.id;
}

/**
 * Heuristic Temporal Sync — extracts gates from docs/features Markdown.
 * Respects userPinned / locked; marks conflicts when newer docs disagree.
 */
export function syncReminderTimelineFromDocs(
  workspaceRoot: string,
  nowIso = new Date().toISOString(),
): ReminderTimelineDocument {
  const current = readReminderTimeline(workspaceRoot);
  const byId = new Map(current.items.map((item) => [item.id, item]));
  const changelog: string[] = [];
  let added = 0;
  let updated = 0;
  let conflicts = 0;

  const gates: ExtractedGate[] = [];
  for (const root of reminderDocsGlobRoots(workspaceRoot)) {
    for (const file of listMarkdownFiles(root)) {
      let text: string;
      try {
        text = readFileSync(file, "utf8");
      } catch {
        continue;
      }
      gates.push(...extractFromMarkdown(workspaceRoot, file, text));
    }
  }

  // Ensure a baseline MVP milestone exists when docs mention MVP deferrals.
  if (
    gates.some((g) => /mvp/i.test(g.title) || /mvp/i.test(g.dependsOnTitle ?? "")) &&
    ![...byId.values()].some((item) => /mvp/i.test(item.title) && item.kind === "milestone")
  ) {
    const id = "milestone_mvp_acceptance";
    byId.set(id, {
      id,
      kind: "milestone",
      title: "MVP 验收",
      summary: "All MVP features accepted",
      phaseIndex: 10,
      manualOrder: 0,
      milestoneStatus: "upcoming",
      dependsOn: [],
      sourceRefs: [],
      supersededSources: [],
      userPinned: false,
      locked: false,
      featureIds: [],
      createdAt: nowIso,
      updatedAt: nowIso,
      binding: { type: "manual" },
    });
    added += 1;
  }

  // First pass: milestones
  for (const gate of gates.filter((g) => g.kind === "milestone")) {
    const id = stableId("milestone", gate.path, gate.title);
    const existing = byId.get(id);
    const ref = sourceRef(gate, nowIso);
    if (!existing) {
      byId.set(id, {
        id,
        kind: "milestone",
        title: gate.title,
        summary: gate.excerpt,
        phaseIndex: 10 + byId.size,
        manualOrder: 0,
        targetDate: gate.targetDate ?? null,
        milestoneStatus: "upcoming",
        dependsOn: [],
        binding: { type: "manual" },
        sourceRefs: [ref],
        supersededSources: [],
        userPinned: false,
        locked: false,
        featureIds: [],
        createdAt: nowIso,
        updatedAt: nowIso,
      });
      added += 1;
      continue;
    }
    if (existing.userPinned || existing.locked) continue;
    byId.set(id, {
      ...existing,
      summary: gate.excerpt,
      targetDate: gate.targetDate ?? existing.targetDate,
      sourceRefs: mergeSources(existing.sourceRefs, ref),
      updatedAt: nowIso,
    });
    updated += 1;
  }

  // Second pass: reminders
  const itemsSoFar = [...byId.values()];
  for (const gate of gates.filter((g) => g.kind === "reminder")) {
    const id = stableId("reminder", gate.path, gate.title);
    const existing = byId.get(id);
    const ref = sourceRef(gate, nowIso);
    const depId =
      findMilestoneIdByTitle(itemsSoFar, gate.dependsOnTitle) ??
      findMilestoneIdByTitle(itemsSoFar, "MVP 验收") ??
      ([...byId.values()].find((i) => i.kind === "milestone")?.id as
        | string
        | undefined);
    const dependsOn = depId ? [depId] : [];

    if (!existing) {
      byId.set(id, {
        id,
        kind: "reminder",
        title: gate.title,
        summary: gate.excerpt,
        phaseIndex: (depId ? (byId.get(depId)?.phaseIndex ?? 20) : 20) + 1,
        manualOrder: byId.size,
        targetDate: gate.targetDate ?? null,
        reminderStatus: "parked",
        dependsOn,
        sourceRefs: [ref],
        supersededSources: [],
        userPinned: false,
        locked: false,
        featureIds: [],
        createdAt: nowIso,
        updatedAt: nowIso,
      });
      added += 1;
      continue;
    }

    if (existing.userPinned || existing.locked) {
      const depChanged =
        dependsOn.join(",") !== (existing.dependsOn ?? []).join(",");
      if (depChanged) {
        byId.set(id, {
          ...existing,
          reminderStatus: "conflict",
          conflictNote: `Newer docs suggest dependsOn=${dependsOn.join(",") || "none"}; pin kept.`,
          supersededSources: mergeSources(existing.supersededSources, ref),
          updatedAt: nowIso,
        });
        conflicts += 1;
      }
      continue;
    }

    byId.set(id, {
      ...existing,
      summary: gate.excerpt,
      dependsOn,
      targetDate: gate.targetDate ?? existing.targetDate,
      sourceRefs: mergeSources(existing.sourceRefs, ref),
      reminderStatus:
        existing.reminderStatus === "conflict"
          ? "parked"
          : existing.reminderStatus,
      conflictNote: undefined,
      updatedAt: nowIso,
    });
    updated += 1;
  }

  // Inbox: surface a hint when no deferral reminders were extracted
  if (![...byId.values()].some((i) => i.kind === "reminder")) {
    const inboxId = createReminderItemId("inbox");
    byId.set(inboxId, {
      id: inboxId,
      kind: "inbox",
      title: "Scan found no deferral phrases yet",
      summary: "Add MVP/after language in Dev Plans, then Sync.",
      phaseIndex: 0,
      manualOrder: 0,
      reminderStatus: "parked",
      dependsOn: [],
      sourceRefs: [],
      supersededSources: [],
      userPinned: false,
      locked: false,
      featureIds: [],
      createdAt: nowIso,
      updatedAt: nowIso,
    });
  }

  changelog.push(
    `Sync +${added} / ~${updated} / conflict ${conflicts} from docs/features`,
  );

  let next: ReminderTimelineDocument = normalizeTimeline({
    ...current,
    items: [...byId.values()],
    lastSyncedAt: nowIso,
    lastSyncChangelog: [
      { at: nowIso, message: changelog.join("; ") },
      ...(current.lastSyncChangelog ?? []),
    ].slice(0, 50),
    pendingEditOffer: current.pendingEditOffer ?? null,
  });

  next = applyDueMilestoneStatuses(next, Date.parse(nowIso));
  next = applyBindingWatch(next, workspaceRoot, nowIso);

  return writeReminderTimeline(workspaceRoot, next);
}

function mergeSources(
  existing: ReminderSourceRef[] | undefined,
  next: ReminderSourceRef,
): ReminderSourceRef[] {
  const list = [...(existing ?? [])];
  const idx = list.findIndex((s) => s.path === next.path && s.heading === next.heading);
  if (idx >= 0) list[idx] = next;
  else list.unshift(next);
  return list.slice(0, 32);
}

/** Demo document for mock / empty workspaces. */
export function buildDemoReminderTimeline(
  nowIso = new Date().toISOString(),
): ReminderTimelineDocument {
  const mvpId = "milestone_mvp_acceptance";
  const v1Id = "milestone_v1_ship";
  return normalizeTimeline({
    version: 1,
    composerMode: "ask",
    lastSyncedAt: nowIso,
    lastSyncChangelog: [
      {
        at: nowIso,
        message: "Demo timeline seeded for Reminder Graph",
      },
    ],
    pendingEditOffer: null,
    items: [
      {
        id: mvpId,
        kind: "milestone",
        title: "MVP 验收",
        summary: "All MVP-stage features accepted",
        phaseIndex: 10,
        manualOrder: 0,
        milestoneStatus: "upcoming",
        dependsOn: [],
        binding: { type: "manual" },
        sourceRefs: [
          {
            path: "docs/features/Reminder-Graph-Dev-Plan.md",
            heading: "锁定决策",
            excerpt: "MVP 验收后再开发的延后事项…",
            updatedAt: nowIso,
          },
        ],
        supersededSources: [],
        userPinned: false,
        locked: false,
        featureIds: [],
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      {
        id: "reminder_marketplace_after_mvp",
        kind: "reminder",
        title: "Capability Marketplace 在全部 MVP 验收后开发",
        summary: "Deferred until MVP acceptance gate passes",
        phaseIndex: 11,
        manualOrder: 0,
        reminderStatus: "parked",
        dependsOn: [mvpId],
        sourceRefs: [
          {
            path: "docs/features/Capability-Marketplace-Dev-Plan.md",
            heading: "非目标",
            excerpt: "…在 MVP 验收之后再进行…",
            updatedAt: nowIso,
          },
        ],
        supersededSources: [],
        userPinned: false,
        locked: false,
        featureIds: [],
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      {
        id: v1Id,
        kind: "milestone",
        title: "v1 推向市场",
        summary: "Public v1 ship gate",
        phaseIndex: 20,
        manualOrder: 0,
        targetDate: null,
        milestoneStatus: "upcoming",
        dependsOn: [],
        binding: { type: "git_tag", tagPattern: "v1.*" },
        sourceRefs: [],
        supersededSources: [],
        userPinned: false,
        locked: false,
        featureIds: [],
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      {
        id: "reminder_hard_gate_agents",
        kind: "reminder",
        title: "Agent hard-gate 未到点功能（Stretch）",
        summary: "After Reminder Graph MVP + context injection",
        phaseIndex: 21,
        manualOrder: 0,
        reminderStatus: "parked",
        dependsOn: [v1Id],
        sourceRefs: [
          {
            path: "docs/features/Reminder-Graph-Dev-Plan.md",
            heading: "非目标",
            excerpt: "自动阻止 coding agent…属后期",
            updatedAt: nowIso,
          },
        ],
        supersededSources: [],
        userPinned: false,
        locked: false,
        featureIds: [],
        createdAt: nowIso,
        updatedAt: nowIso,
      },
    ],
  });
}
