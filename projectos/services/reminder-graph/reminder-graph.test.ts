import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ReminderTimelineDocumentSchema,
  emptyReminderTimeline,
} from "../../contracts/reminder-graph.js";
import {
  applyBindingWatch,
  buildDemoReminderTimeline,
  diffReminderNotifications,
  proposeOrApplyReorder,
  renderReminderCommitmentsMarkdown,
  setReminderMilestoneStatus,
  syncReminderTimelineFromDocs,
  writeReminderTimeline,
} from "./index.js";
import { propagateReminderReadiness, sortReminderItems } from "./timeline-order.js";
import { buildHarnessInstructions } from "../harness/instructions.js";

describe("reminder-graph", () => {
  it("parses empty and demo documents", () => {
    expect(ReminderTimelineDocumentSchema.parse(emptyReminderTimeline()).items).toEqual(
      [],
    );
    const demo = buildDemoReminderTimeline("2026-11-05T00:00:00.000Z");
    expect(demo.items.some((item) => item.kind === "milestone")).toBe(true);
    expect(demo.items.some((item) => item.id === "reminder_marketplace_after_mvp")).toBe(
      true,
    );
  });

  it("sorts by hybrid phase then manual order", () => {
    const sorted = sortReminderItems([
      {
        id: "b",
        kind: "reminder",
        title: "b",
        phaseIndex: 2,
        manualOrder: 0,
        reminderStatus: "parked",
        dependsOn: [],
        sourceRefs: [],
        supersededSources: [],
        userPinned: false,
        locked: false,
        featureIds: [],
        createdAt: "2026-11-05T00:00:00.000Z",
        updatedAt: "2026-11-05T00:00:00.000Z",
      },
      {
        id: "a",
        kind: "milestone",
        title: "a",
        phaseIndex: 1,
        manualOrder: 0,
        milestoneStatus: "upcoming",
        dependsOn: [],
        sourceRefs: [],
        supersededSources: [],
        userPinned: false,
        locked: false,
        featureIds: [],
        createdAt: "2026-11-05T00:00:00.000Z",
        updatedAt: "2026-11-05T00:00:00.000Z",
      },
    ]);
    expect(sorted.map((item) => item.id)).toEqual(["a", "b"]);
  });

  it("propagates reminder readiness when milestone passes", () => {
    const now = "2026-11-05T00:00:00.000Z";
    const next = propagateReminderReadiness(
      [
        {
          id: "m1",
          kind: "milestone",
          title: "MVP",
          phaseIndex: 1,
          manualOrder: 0,
          milestoneStatus: "passed",
          dependsOn: [],
          sourceRefs: [],
          supersededSources: [],
          userPinned: false,
          locked: false,
          featureIds: [],
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "r1",
          kind: "reminder",
          title: "Later feature",
          phaseIndex: 2,
          manualOrder: 0,
          reminderStatus: "parked",
          dependsOn: ["m1"],
          sourceRefs: [],
          supersededSources: [],
          userPinned: false,
          locked: false,
          featureIds: [],
          createdAt: now,
          updatedAt: now,
        },
      ],
      now,
    );
    expect(next.find((item) => item.id === "r1")?.reminderStatus).toBe("ready");
  });

  it("syncs deferral phrases from markdown and protects pins", async () => {
    const root = mkdtempSync(join(tmpdir(), "reminder-graph-"));
    const docs = join(root, "docs", "features");
    mkdirSync(docs, { recursive: true });
    writeFileSync(
      join(docs, "Sample-Dev-Plan.md"),
      `# Sample\n\nMVP 验收后再开发 Capability Marketplace。\n`,
      "utf8",
    );
    const synced = syncReminderTimelineFromDocs(root, "2026-11-05T00:00:00.000Z");
    expect(synced.items.some((item) => item.kind === "reminder")).toBe(true);
    expect(synced.items.some((item) => /mvp/i.test(item.title))).toBe(true);

    const reminder = synced.items.find((item) => item.kind === "reminder");
    expect(reminder).toBeTruthy();
    const offered = await proposeOrApplyReorder(root, {
      itemId: reminder!.id,
      newPhaseIndex: 0,
      newManualOrder: 0,
      confirm: false,
    });
    expect(offered.pendingEditOffer).toBeTruthy();

    const accepted = await proposeOrApplyReorder(root, {
      itemId: reminder!.id,
      newPhaseIndex: 0,
      newManualOrder: 0,
      confirm: true,
    });
    const pinned = accepted.items.find((item) => item.id === reminder!.id);
    expect(pinned?.userPinned).toBe(true);
    expect(pinned?.phaseIndex).toBe(0);

    writeFileSync(
      join(docs, "Sample-Dev-Plan.md"),
      `# Sample\n\n现在立刻开发 Capability Marketplace。\n`,
      "utf8",
    );
    const again = syncReminderTimelineFromDocs(root, "2026-11-05T01:00:00.000Z");
    const afterPin = again.items.find((item) => item.id === reminder!.id);
    expect(afterPin?.phaseIndex).toBe(0);
  });

  it("marks dependent reminders ready after manual milestone complete", () => {
    const root = mkdtempSync(join(tmpdir(), "reminder-complete-"));
    const demo = buildDemoReminderTimeline("2026-11-05T00:00:00.000Z");
    writeReminderTimeline(root, demo);
    const next = setReminderMilestoneStatus(root, {
      milestoneId: "milestone_mvp_acceptance",
      status: "passed",
      source: "manual",
    });
    const marketplace = next.items.find(
      (item) => item.id === "reminder_marketplace_after_mvp",
    );
    expect(marketplace?.reminderStatus).toBe("ready");
    const events = diffReminderNotifications(demo, next);
    expect(events.some((event) => event.kind === "milestone_passed")).toBe(true);
    expect(events.some((event) => event.kind === "reminder_ready")).toBe(true);
  });

  it("auto-completes milestones from feature_acceptance binding", () => {
    const root = mkdtempSync(join(tmpdir(), "reminder-bind-"));
    mkdirSync(join(root, ".projectos"), { recursive: true });
    writeFileSync(
      join(root, ".projectos", "features.json"),
      JSON.stringify({
        features: [{ id: "feat_mvp", status: "implemented" }],
      }),
      "utf8",
    );
    const now = "2026-11-05T00:00:00.000Z";
    const doc = {
      ...buildDemoReminderTimeline(now),
      items: [
        {
          id: "m_feat",
          kind: "milestone" as const,
          title: "Feature accepted",
          phaseIndex: 1,
          manualOrder: 0,
          milestoneStatus: "upcoming" as const,
          dependsOn: [],
          binding: { type: "feature_acceptance" as const, featureId: "feat_mvp" },
          sourceRefs: [],
          supersededSources: [],
          userPinned: false,
          locked: false,
          featureIds: [],
          createdAt: now,
          updatedAt: now,
        },
      ],
    };
    const next = applyBindingWatch(doc, root, now, {
      tags: [],
      features: new Map([["feat_mvp", "implemented"]]),
      loopStatuses: new Map(),
      checklists: new Map(),
    });
    expect(next.items[0]?.milestoneStatus).toBe("passed");
    expect(next.items[0]?.bindingCompleteAt).toBeTruthy();
  });

  it("auto-completes from loop_run and checklist bindings", () => {
    const root = mkdtempSync(join(tmpdir(), "reminder-bind2-"));
    mkdirSync(join(root, ".projectos", "loop-graphs"), { recursive: true });
    mkdirSync(join(root, "docs"), { recursive: true });
    writeFileSync(
      join(root, ".projectos", "loop-graphs", "loop_mvp.json"),
      JSON.stringify({
        id: "loop_mvp",
        instances: [{ status: "complete" }],
      }),
      "utf8",
    );
    writeFileSync(
      join(root, "docs", "acceptance.md"),
      `# Plan\n\n## MVP gate\n\n- [x] Spec reviewed\n- [x] Demo accepted\n\n## Later\n\n- [ ] Skip\n`,
      "utf8",
    );
    const now = "2026-11-05T00:00:00.000Z";
    const doc = {
      ...buildDemoReminderTimeline(now),
      items: [
        {
          id: "m_loop",
          kind: "milestone" as const,
          title: "Loop succeeded",
          phaseIndex: 1,
          manualOrder: 0,
          milestoneStatus: "upcoming" as const,
          dependsOn: [],
          binding: {
            type: "loop_run" as const,
            loopId: "loop_mvp",
            requireStatus: "succeeded" as const,
          },
          sourceRefs: [],
          supersededSources: [],
          userPinned: false,
          locked: false,
          featureIds: [],
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "m_check",
          kind: "milestone" as const,
          title: "Checklist done",
          phaseIndex: 2,
          manualOrder: 0,
          milestoneStatus: "upcoming" as const,
          dependsOn: [],
          binding: {
            type: "checklist" as const,
            docPath: "docs/acceptance.md",
            headingAnchor: "MVP gate",
          },
          sourceRefs: [],
          supersededSources: [],
          userPinned: false,
          locked: false,
          featureIds: [],
          createdAt: now,
          updatedAt: now,
        },
      ],
    };
    const next = applyBindingWatch(doc, root, now);
    expect(next.items.find((item) => item.id === "m_loop")?.milestoneStatus).toBe(
      "passed",
    );
    expect(next.items.find((item) => item.id === "m_check")?.milestoneStatus).toBe(
      "passed",
    );
  });

  it("renders commitments for harness injection", () => {
    const demo = buildDemoReminderTimeline("2026-11-05T00:00:00.000Z");
    const markdown = renderReminderCommitmentsMarkdown(demo);
    expect(markdown).toContain("[milestone:upcoming]");
    expect(markdown).toContain("[reminder:parked]");
    const text = buildHarnessInstructions({
      baseSystemPrompt: "Agent",
      mode: "change",
      reminderCommitmentsMarkdown: markdown,
    });
    expect(text).toContain("Reminder Graph commitments");
    expect(text).toContain("```reminder-commitments");
  });
});
