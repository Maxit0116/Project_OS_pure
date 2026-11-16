/**
 * Loop Schedule — wall-clock arming for automatic createRun.
 */

import { z } from "zod";

import {
  LOOP_SCHEDULE_MODES,
  type LoopScheduleMode,
} from "./loop-node-architecture.js";

export const LoopScheduleModeSchema = z.enum(LOOP_SCHEDULE_MODES);

export const LoopArmedScheduleSchema = z
  .object({
    id: z.string().min(1),
    nodeId: z.string().min(1),
    fireAt: z.string().min(1),
    mode: LoopScheduleModeSchema,
    createdAt: z.string().min(1),
  })
  .strict();

export type LoopArmedSchedule = z.infer<typeof LoopArmedScheduleSchema>;

export function computeScheduleFireAt(input: {
  mode: LoopScheduleMode;
  waitMs?: number;
  scheduleAt?: string;
  nowMs?: number;
}): { ok: true; fireAt: string } | { ok: false; reason: string } {
  const now = input.nowMs ?? Date.now();
  if (input.mode === "delay") {
    const waitMs = input.waitMs ?? 0;
    if (!Number.isFinite(waitMs) || waitMs < 0) {
      return { ok: false, reason: "Schedule delay must be a non-negative duration" };
    }
    if (waitMs > 7 * 24 * 60 * 60 * 1000) {
      return { ok: false, reason: "Schedule delay max is 7 days" };
    }
    return { ok: true, fireAt: new Date(now + waitMs).toISOString() };
  }
  const raw = input.scheduleAt?.trim();
  if (!raw) {
    return { ok: false, reason: "Schedule absolute time is required" };
  }
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) {
    return { ok: false, reason: "Schedule absolute time is invalid" };
  }
  return { ok: true, fireAt: new Date(parsed).toISOString() };
}

export function isScheduleDue(
  fireAt: string,
  nowMs: number = Date.now(),
): boolean {
  const t = Date.parse(fireAt);
  if (!Number.isFinite(t)) return false;
  return t <= nowMs;
}

export function createArmedScheduleId(): string {
  return `sch_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
