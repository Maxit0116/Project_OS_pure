import { z } from "zod";

export const GeneratedDiffChangeTypeSchema = z.enum([
  "create",
  "modify",
  "delete",
]);

export const GeneratedDiffFileSchema = z
  .object({
    path: z.string().min(1).refine((path) => path.trim().length > 0, {
      message: "Diff path must not be blank",
    }),
    changeType: GeneratedDiffChangeTypeSchema,
    before: z.string().optional(),
    after: z.string().optional(),
    patch: z.string().optional(),
  })
  .strict()
  .superRefine((file, ctx) => {
    const hasBefore = file.before !== undefined;
    const hasAfter = file.after !== undefined;
    const expected =
      file.changeType === "create"
        ? { before: false, after: true }
        : file.changeType === "delete"
          ? { before: true, after: false }
          : undefined;
    if (!expected) {
      if (hasBefore !== hasAfter) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [hasBefore ? "after" : "before"],
          message:
            "modify diff must include both before and after content, or neither when patch is used",
        });
      }
      if (!hasBefore && !hasAfter && file.patch === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["patch"],
          message: "modify diff requires content or a patch",
        });
      }
      return;
    }
    if (hasBefore !== expected.before) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["before"],
        message: `${file.changeType} diff has inconsistent before content`,
      });
    }
    if (hasAfter !== expected.after) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["after"],
        message: `${file.changeType} diff has inconsistent after content`,
      });
    }
  });

export const GeneratedDiffSchema = z
  .object({
    runId: z.string(),
    summary: z.string(),
    files: z.array(GeneratedDiffFileSchema),
  })
  .strict();

export const VerificationStatusSchema = z.enum([
  "not_run",
  "passed",
  "failed",
  "demo_passed",
]);

export const ApplyResultSchema = z
  .object({
    runId: z.string(),
    applied: z.boolean(),
    filesChanged: z.array(z.string()),
    verificationStatus: VerificationStatusSchema,
    outcome: z.enum(["applied", "recovery_required", "rejected"]).optional(),
    backupId: z.string().optional(),
    reason: z.string().optional(),
  })
  .strict();

export const RestoreApplyResultSchema = z.discriminatedUnion("outcome", [
  z.object({
    backupId: z.string().min(1),
    restored: z.literal(true),
    filesRestored: z.array(z.string()),
    outcome: z.literal("restored"),
    reason: z.string().optional(),
  }).strict(),
  z.object({
    backupId: z.string().min(1),
    restored: z.literal(false),
    filesRestored: z.array(z.string()),
    outcome: z.literal("recovery_required"),
    reason: z.string().optional(),
  }).strict(),
]);

export type GeneratedDiffChangeType = z.infer<
  typeof GeneratedDiffChangeTypeSchema
>;
export type GeneratedDiffFile = z.infer<typeof GeneratedDiffFileSchema>;
export type GeneratedDiff = z.infer<typeof GeneratedDiffSchema>;
export type VerificationStatus = z.infer<typeof VerificationStatusSchema>;
export type ApplyResult = z.infer<typeof ApplyResultSchema>;
export type RestoreApplyResult = z.infer<typeof RestoreApplyResultSchema>;
