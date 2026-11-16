import { describe, expect, it } from "vitest";

import {
  computeScheduleFireAt,
  isScheduleDue,
} from "./loop-schedule.js";

describe("loop-schedule", () => {
  it("computes delay fireAt from now", () => {
    const now = Date.parse("2026-01-01T00:00:00.000Z");
    const result = computeScheduleFireAt({
      mode: "delay",
      waitMs: 60_000,
      nowMs: now,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.fireAt).toBe("2026-01-01T00:01:00.000Z");
    expect(isScheduleDue(result.fireAt, now + 59_000)).toBe(false);
    expect(isScheduleDue(result.fireAt, now + 60_000)).toBe(true);
  });

  it("parses absolute scheduleAt", () => {
    const result = computeScheduleFireAt({
      mode: "at",
      scheduleAt: "2026-06-01T12:00:00.000Z",
    });
    expect(result).toEqual({
      ok: true,
      fireAt: "2026-06-01T12:00:00.000Z",
    });
  });
});
