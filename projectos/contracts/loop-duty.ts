/**
 * Node duty checklist — assignment items for Loop Graph duty nodes.
 * Capability description (palette / prompt prose) is secondary; dutyItems are
 * what the node must complete in the workflow.
 */

import { z } from "zod";

export const LOOP_DUTY_ITEM_MAX = 20;
export const LOOP_DUTY_ITEM_TEXT_MAX = 240;

/** Mirrors AcceptanceKindSchema — kept local to avoid circular imports with loop-graph. */
export const LoopDutyKindSchema = z.enum(["machine", "human"]);

export const LoopDutyItemSourceSchema = z.enum([
  "user",
  "agent",
  "palette",
  "migrate",
  "authoring",
]);

export const LoopDutyItemStatusSchema = z.enum([
  "pending",
  "done",
  "blocked",
  "skipped",
]);

export const LoopDutyItemSchema = z
  .object({
    id: z.string().min(1),
    text: z.string().trim().min(1).max(LOOP_DUTY_ITEM_TEXT_MAX),
    kind: LoopDutyKindSchema,
    required: z.boolean().default(true),
    source: LoopDutyItemSourceSchema.optional(),
  })
  .strict();

export const LoopDutyProgressItemSchema = z
  .object({
    id: z.string().min(1),
    status: LoopDutyItemStatusSchema,
    updatedAt: z.string().min(1).optional(),
    evidenceRef: z.string().min(1).optional(),
  })
  .strict();

export type LoopDutyItem = z.infer<typeof LoopDutyItemSchema>;
export type LoopDutyItemSource = z.infer<typeof LoopDutyItemSourceSchema>;
export type LoopDutyItemStatus = z.infer<typeof LoopDutyItemStatusSchema>;
export type LoopDutyProgressItem = z.infer<typeof LoopDutyProgressItemSchema>;

export function newDutyItemId(prefix = "duty"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

/** True when the node has an authored assignment checklist (not just capability prose). */
export function hasDutyAssignment(node: {
  dutyItems?: LoopDutyItem[] | undefined;
  dutyEdited?: boolean | undefined;
}): boolean {
  if (node.dutyEdited === true) return true;
  return (node.dutyItems?.length ?? 0) > 0;
}

/** Split free-text prompt into checklist rows (newline / semicolon / numbered). */
export function splitPromptIntoDutyTexts(prompt: string): string[] {
  const raw = prompt.trim();
  if (!raw) return [];
  const byLine = raw
    .split(/\n+/)
    .map((line) => line.replace(/^\s*[-*•]\s+/, "").replace(/^\s*\d+[.)]\s+/, "").trim())
    .filter(Boolean);
  if (byLine.length > 1) return byLine.slice(0, LOOP_DUTY_ITEM_MAX);
  const bySemi = raw
    .split(/[;；]/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (bySemi.length > 1) return bySemi.slice(0, LOOP_DUTY_ITEM_MAX);
  return [raw.slice(0, LOOP_DUTY_ITEM_TEXT_MAX)];
}

export function dutyItemsFromPrompt(
  prompt: string,
  options?: {
    kind?: "machine" | "human";
    source?: LoopDutyItemSource;
    required?: boolean;
  },
): LoopDutyItem[] {
  const kind = options?.kind ?? "machine";
  const source = options?.source ?? "migrate";
  const required = options?.required ?? true;
  return splitPromptIntoDutyTexts(prompt).map((text) => ({
    id: newDutyItemId(),
    text: text.slice(0, LOOP_DUTY_ITEM_TEXT_MAX),
    kind,
    required,
    source,
  }));
}

/** Resolve effective duty items for compile / display (legacy prompt fallback). */
export function resolveDutyItems(node: {
  id: string;
  title: string;
  prompt: string;
  dutyItems?: LoopDutyItem[] | undefined;
  type?: string | undefined;
  humanMode?: string | undefined;
}): LoopDutyItem[] {
  if (node.dutyItems && node.dutyItems.length > 0) {
    return node.dutyItems.slice(0, LOOP_DUTY_ITEM_MAX);
  }
  const prompt = node.prompt.trim();
  if (prompt) {
    const kind =
      node.type === "human" || node.humanMode ? ("human" as const) : ("machine" as const);
    return dutyItemsFromPrompt(prompt, { kind, source: "migrate" });
  }
  return [
    {
      id: `duty_${node.id}_default`,
      text: `Complete: ${node.title}`.slice(0, LOOP_DUTY_ITEM_TEXT_MAX),
      kind: node.type === "human" || node.humanMode ? "human" : "machine",
      required: true,
      source: "migrate",
    },
  ];
}

export function dutyItemsToAcceptance(
  items: LoopDutyItem[],
): Array<{ id: string; description: string; kind: "machine" | "human" }> {
  return items.slice(0, LOOP_DUTY_ITEM_MAX).map((item) => ({
    id: item.id.startsWith("acc_") ? item.id : `acc_${item.id}`,
    description: item.text,
    kind: item.kind,
  }));
}

export function initDutyProgressFromAcceptance(
  acceptance: Array<{ id: string }>,
  at: string,
): LoopDutyProgressItem[] {
  return acceptance.slice(0, LOOP_DUTY_ITEM_MAX).map((item) => ({
    id: item.id.replace(/^acc_/, "") === item.id ? item.id : item.id.replace(/^acc_/, ""),
    status: "pending" as const,
    updatedAt: at,
  }));
}

/** Prefer matching acceptance ids; fall back to duty item ids. */
export function initDutyProgress(
  items: Array<{ id: string }>,
  at: string,
): LoopDutyProgressItem[] {
  return items.slice(0, LOOP_DUTY_ITEM_MAX).map((item) => ({
    id: item.id,
    status: "pending" as const,
    updatedAt: at,
  }));
}

export function areRequiredDutiesComplete(
  items: Array<{ id: string; required?: boolean }>,
  progress: LoopDutyProgressItem[] | undefined,
): boolean {
  if (items.length === 0) return true;
  const byId = new Map((progress ?? []).map((p) => [p.id, p]));
  // Also match acc_ prefixed ids from acceptance mapping.
  for (const item of items) {
    if (item.required === false) continue;
    const row =
      byId.get(item.id) ??
      byId.get(item.id.replace(/^acc_/, "")) ??
      byId.get(`acc_${item.id}`);
    if (!row || (row.status !== "done" && row.status !== "skipped")) {
      return false;
    }
  }
  return true;
}

export function dutyProgressCounts(
  items: Array<{ id: string; required?: boolean }>,
  progress: LoopDutyProgressItem[] | undefined,
): { done: number; total: number } {
  const required = items.filter((item) => item.required !== false);
  const total = required.length;
  if (total === 0) return { done: 0, total: 0 };
  const byId = new Map((progress ?? []).map((p) => [p.id, p]));
  let done = 0;
  for (const item of required) {
    const row =
      byId.get(item.id) ??
      byId.get(item.id.replace(/^acc_/, "")) ??
      byId.get(`acc_${item.id}`);
    if (row && (row.status === "done" || row.status === "skipped")) done += 1;
  }
  return { done, total };
}

export function markAllDutiesDone(
  progress: LoopDutyProgressItem[] | undefined,
  at: string,
): LoopDutyProgressItem[] {
  return (progress ?? []).map((item) => ({
    ...item,
    status: "done" as const,
    updatedAt: at,
  }));
}

export function toggleDutyProgressItem(
  progress: LoopDutyProgressItem[],
  itemId: string,
  nextStatus: LoopDutyItemStatus,
  at: string,
): LoopDutyProgressItem[] {
  let found = false;
  const next = progress.map((item) => {
    if (
      item.id !== itemId &&
      item.id !== itemId.replace(/^acc_/, "") &&
      `acc_${item.id}` !== itemId
    ) {
      return item;
    }
    found = true;
    return { ...item, status: nextStatus, updatedAt: at };
  });
  if (!found) {
    next.push({ id: itemId, status: nextStatus, updatedAt: at });
  }
  return next;
}

/** Seed checklist rows from a palette/capability prompt (source=palette). */
export function seedDutyItemsFromCapabilityPrompt(
  prompt: string,
  options?: {
    kind?: "machine" | "human";
    title?: string;
  },
): LoopDutyItem[] {
  const kind = options?.kind ?? "machine";
  const fromPrompt = dutyItemsFromPrompt(prompt, { kind, source: "palette" });
  if (fromPrompt.length > 0) return fromPrompt;
  if (options?.title?.trim()) {
    return [
      {
        id: newDutyItemId(),
        text: `Complete: ${options.title.trim()}`.slice(0, LOOP_DUTY_ITEM_TEXT_MAX),
        kind,
        required: true,
        source: "palette",
      },
    ];
  }
  return [];
}

export type LoopDutyChecklistMutateOp =
  | {
      op: "add";
      text: string;
      kind?: "machine" | "human";
      required?: boolean;
      id?: string;
    }
  | {
      op: "update";
      itemId: string;
      text?: string;
      kind?: "machine" | "human";
      required?: boolean;
    }
  | { op: "remove"; itemId: string }
  | { op: "replace"; items: LoopDutyItem[] };

/** Apply a structural mutate to a duty checklist (design-time or runtime overlay). */
export function mutateDutyItems(
  current: LoopDutyItem[],
  mutate: LoopDutyChecklistMutateOp,
): LoopDutyItem[] {
  switch (mutate.op) {
    case "replace":
      return mutate.items.slice(0, LOOP_DUTY_ITEM_MAX).map((item) => ({
        ...item,
        text: item.text.slice(0, LOOP_DUTY_ITEM_TEXT_MAX),
      }));
    case "add": {
      if (current.length >= LOOP_DUTY_ITEM_MAX) return current;
      const text = mutate.text.trim().slice(0, LOOP_DUTY_ITEM_TEXT_MAX);
      if (!text) return current;
      return [
        ...current,
        {
          id: mutate.id?.trim() || newDutyItemId(),
          text,
          kind: mutate.kind ?? "machine",
          required: mutate.required ?? true,
          source: "agent",
        },
      ];
    }
    case "update": {
      return current.map((item) => {
        if (item.id !== mutate.itemId) return item;
        return {
          ...item,
          ...(mutate.text !== undefined
            ? { text: mutate.text.trim().slice(0, LOOP_DUTY_ITEM_TEXT_MAX) }
            : {}),
          ...(mutate.kind !== undefined ? { kind: mutate.kind } : {}),
          ...(mutate.required !== undefined ? { required: mutate.required } : {}),
          source: "agent",
        };
      });
    }
    case "remove":
      return current.filter((item) => item.id !== mutate.itemId);
    default:
      return current;
  }
}

/** Keep progress rows aligned with the current duty item ids. */
export function syncDutyProgressWithItems(
  items: LoopDutyItem[],
  progress: LoopDutyProgressItem[] | undefined,
  at: string,
): LoopDutyProgressItem[] {
  const prev = new Map((progress ?? []).map((row) => [row.id, row]));
  return items.map((item) => {
    const existing = prev.get(item.id);
    if (existing) return existing;
    return { id: item.id, status: "pending" as const, updatedAt: at };
  });
}

/** Project DevPlan tasks into coder duty checklist items. */
export function dutyItemsFromDevPlanTasks(
  tasks: Array<{ id: string; title: string }>,
): LoopDutyItem[] {
  return tasks.slice(0, LOOP_DUTY_ITEM_MAX).map((task) => ({
    id: `duty_plan_${task.id}`,
    text: task.title.slice(0, LOOP_DUTY_ITEM_TEXT_MAX),
    kind: "machine" as const,
    required: true,
    source: "agent" as const,
  }));
}
