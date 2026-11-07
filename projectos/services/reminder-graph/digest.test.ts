import { describe, expect, it } from "vitest";
import { buildDemoReminderTimeline } from "./sync-service.js";
import {
  buildReminderDigest,
  currentLocalDateKey,
  shouldSendReminderDigest,
} from "./digest.js";
import { setReminderMilestoneStatus, writeReminderTimeline } from "./index.js";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("reminder digest", () => {
  it("skips digest when already sent today", () => {
    const today = currentLocalDateKey(Date.parse("2026-11-05T08:00:00.000Z"), "UTC");
    expect(
      shouldSendReminderDigest({
        lastDigestLocalDate: today,
        nowMs: Date.parse("2026-11-05T20:00:00.000Z"),
        timeZone: "UTC",
      }),
    ).toBe(false);
    expect(
      shouldSendReminderDigest({
        lastDigestLocalDate: "2026-11-04",
        nowMs: Date.parse("2026-11-05T08:00:00.000Z"),
        timeZone: "UTC",
      }),
    ).toBe(true);
  });

  it("builds digest after milestones unlock ready work", () => {
    const root = mkdtempSync(join(tmpdir(), "reminder-digest-"));
    const demo = buildDemoReminderTimeline("2026-11-05T00:00:00.000Z");
    writeReminderTimeline(root, demo);
    const next = setReminderMilestoneStatus(root, {
      milestoneId: "milestone_mvp_acceptance",
      status: "passed",
      source: "manual",
    });
    const digest = buildReminderDigest(next, Date.parse("2026-11-05T12:00:00.000Z"));
    expect(digest.readyCount).toBeGreaterThan(0);
    expect(digest.events[0]?.kind).toBe("digest");
    expect(digest.events[0]?.body).toMatch(/ready/i);
  });

  it("returns empty events when nothing actionable", () => {
    const digest = buildReminderDigest({
      version: 1,
      items: [],
      lastSyncedAt: null,
      lastSyncChangelog: [],
      composerMode: "ask",
      pendingEditOffer: null,
    });
    expect(digest.events).toEqual([]);
  });
});
