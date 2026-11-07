import { z } from "zod";

export const ReminderComposerModeSchema = z.enum(["ask", "edit"]);
export type ReminderComposerMode = z.infer<typeof ReminderComposerModeSchema>;

export const ReminderItemKindSchema = z.enum(["milestone", "reminder", "inbox"]);
export type ReminderItemKind = z.infer<typeof ReminderItemKindSchema>;

export const MilestoneStatusSchema = z.enum([
  "upcoming",
  "due",
  "passed",
  "waived",
]);
export type MilestoneStatus = z.infer<typeof MilestoneStatusSchema>;

export const ReminderStatusSchema = z.enum([
  "parked",
  "ready",
  "snoozed",
  "done",
  "dropped",
  "conflict",
]);
export type ReminderStatus = z.infer<typeof ReminderStatusSchema>;

export const ReminderSourceRefSchema = z
  .object({
    path: z.string().min(1).max(512),
    heading: z.string().max(240).optional(),
    excerpt: z.string().max(2_000).optional(),
    updatedAt: z.string().max(64).optional(),
  })
  .strict();
export type ReminderSourceRef = z.infer<typeof ReminderSourceRefSchema>;

export const MilestoneBindingSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("manual") }).strict(),
  z
    .object({
      type: z.literal("git_tag"),
      tagPattern: z.string().min(1).max(120),
    })
    .strict(),
  z
    .object({
      type: z.literal("feature_acceptance"),
      featureId: z.string().min(1).max(120),
    })
    .strict(),
  z
    .object({
      type: z.literal("loop_run"),
      loopId: z.string().min(1).max(120),
      requireStatus: z.literal("succeeded"),
    })
    .strict(),
  z
    .object({
      type: z.literal("checklist"),
      docPath: z.string().min(1).max(512),
      headingAnchor: z.string().min(1).max(240),
    })
    .strict(),
]);
export type MilestoneBinding = z.infer<typeof MilestoneBindingSchema>;

export const ReminderTimelineItemSchema = z
  .object({
    id: z.string().min(1).max(120),
    kind: ReminderItemKindSchema,
    title: z.string().min(1).max(240),
    summary: z.string().max(1_000).optional(),
    /** Primary sort key — phase slot on the hybrid axis. */
    phaseIndex: z.number().int().min(0).max(10_000),
    /** Secondary order within the same phase slot. */
    manualOrder: z.number().int().min(0).max(10_000).default(0),
    targetDate: z.string().max(64).nullable().optional(),
    dueAt: z.string().max(64).nullable().optional(),
    milestoneStatus: MilestoneStatusSchema.optional(),
    reminderStatus: ReminderStatusSchema.optional(),
    dependsOn: z.array(z.string().min(1).max(120)).max(32).default([]),
    binding: MilestoneBindingSchema.optional(),
    sourceRefs: z.array(ReminderSourceRefSchema).max(32).default([]),
    supersededSources: z.array(ReminderSourceRefSchema).max(32).default([]),
    conflictNote: z.string().max(1_000).optional(),
    userPinned: z.boolean().default(false),
    locked: z.boolean().default(false),
    snoozeUntil: z.string().max(64).nullable().optional(),
    manualCompleteAt: z.string().max(64).nullable().optional(),
    bindingCompleteAt: z.string().max(64).nullable().optional(),
    featureIds: z.array(z.string().min(1).max(120)).max(32).default([]),
    createdAt: z.string().min(1).max(64),
    updatedAt: z.string().min(1).max(64),
  })
  .strict()
  .superRefine((item, ctx) => {
    if (item.kind === "milestone" && !item.milestoneStatus) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "milestone requires milestoneStatus",
        path: ["milestoneStatus"],
      });
    }
    if (item.kind === "reminder" && !item.reminderStatus) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "reminder requires reminderStatus",
        path: ["reminderStatus"],
      });
    }
  });
export type ReminderTimelineItem = z.infer<typeof ReminderTimelineItemSchema>;

export const ReminderSyncChangelogEntrySchema = z
  .object({
    at: z.string().min(1).max(64),
    message: z.string().min(1).max(500),
  })
  .strict();
export type ReminderSyncChangelogEntry = z.infer<
  typeof ReminderSyncChangelogEntrySchema
>;

export const ReminderDocRewriteSchema = z
  .object({
    path: z.string().min(1).max(512),
    before: z.string().max(200_000),
    after: z.string().max(200_000),
  })
  .strict();
export type ReminderDocRewrite = z.infer<typeof ReminderDocRewriteSchema>;

/** Snapshot of timeline items used inside edit offers (no nested pending offer). */
export const ReminderTimelineSnapshotSchema = z
  .object({
    version: z.literal(1),
    items: z.array(ReminderTimelineItemSchema).max(500),
    lastSyncedAt: z.string().max(64).nullable().optional(),
    lastSyncChangelog: z
      .array(ReminderSyncChangelogEntrySchema)
      .max(50)
      .default([]),
    composerMode: ReminderComposerModeSchema.default("ask"),
  })
  .strict();
export type ReminderTimelineSnapshot = z.infer<
  typeof ReminderTimelineSnapshotSchema
>;

export const ReminderEditOfferSchema = z
  .object({
    id: z.string().min(1).max(120),
    reason: z.string().min(1).max(500),
    createdAt: z.string().min(1).max(64),
    timelineBefore: ReminderTimelineSnapshotSchema,
    timelineAfter: ReminderTimelineSnapshotSchema,
    docRewrites: z.array(ReminderDocRewriteSchema).max(32).default([]),
    featuresTouched: z.array(z.string().min(1).max(120)).max(64).default([]),
  })
  .strict();
export type ReminderEditOffer = z.infer<typeof ReminderEditOfferSchema>;

export const ReminderTimelineDocumentSchema = z
  .object({
    version: z.literal(1),
    items: z.array(ReminderTimelineItemSchema).max(500),
    lastSyncedAt: z.string().max(64).nullable().optional(),
    lastSyncChangelog: z
      .array(ReminderSyncChangelogEntrySchema)
      .max(50)
      .default([]),
    composerMode: ReminderComposerModeSchema.default("ask"),
    pendingEditOffer: ReminderEditOfferSchema.nullable().optional(),
  })
  .strict();
export type ReminderTimelineDocument = z.infer<
  typeof ReminderTimelineDocumentSchema
>;

export const ReminderReorderInputSchema = z
  .object({
    itemId: z.string().min(1).max(120),
    newPhaseIndex: z.number().int().min(0).max(10_000),
    newManualOrder: z.number().int().min(0).max(10_000),
    /** When false, returns a pending offer without applying. */
    confirm: z.boolean().default(false),
  })
  .strict();
export type ReminderReorderInput = z.infer<typeof ReminderReorderInputSchema>;

export const ReminderMilestoneCompleteInputSchema = z
  .object({
    milestoneId: z.string().min(1).max(120),
    status: z.enum(["passed", "upcoming", "waived"]),
    source: z.enum(["manual", "binding"]).default("manual"),
  })
  .strict();
export type ReminderMilestoneCompleteInput = z.infer<
  typeof ReminderMilestoneCompleteInputSchema
>;

export const ReminderAuthoringTurnRequestSchema = z
  .object({
    mode: ReminderComposerModeSchema,
    prompt: z.string().min(1).max(8_000),
  })
  .strict();
export type ReminderAuthoringTurnRequest = z.infer<
  typeof ReminderAuthoringTurnRequestSchema
>;

export const ReminderAuthoringTurnResultSchema = z
  .object({
    document: ReminderTimelineDocumentSchema,
    reply: z.string().max(8_000).optional(),
  })
  .strict();
export type ReminderAuthoringTurnResult = z.infer<
  typeof ReminderAuthoringTurnResultSchema
>;

export const ReminderNotifyKindSchema = z.enum([
  "milestone_due",
  "milestone_passed",
  "reminder_ready",
  "conflict",
  "digest",
]);
export type ReminderNotifyKind = z.infer<typeof ReminderNotifyKindSchema>;

export const ReminderNotifyEventSchema = z
  .object({
    kind: ReminderNotifyKindSchema,
    itemId: z.string().min(1).max(120),
    title: z.string().min(1).max(240),
    body: z.string().min(1).max(1_000),
  })
  .strict();
export type ReminderNotifyEvent = z.infer<typeof ReminderNotifyEventSchema>;

export function emptyReminderTimeline(): ReminderTimelineDocument {
  return {
    version: 1,
    items: [],
    lastSyncedAt: null,
    lastSyncChangelog: [],
    composerMode: "ask",
    pendingEditOffer: null,
  };
}

export function createReminderItemId(prefix: string): string {
  const stamp = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${stamp}_${rand}`;
}
