import { z } from "zod";

import { LocalContextFileDispositionSchema } from "./local-context.js";

export const PromptContextRefSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("file"), path: z.string().min(1) }).strict(),
  z.object({ kind: z.literal("folder"), path: z.string().min(1) }).strict(),
  z.object({ kind: z.literal("node"), nodeId: z.string().min(1) }).strict(),
  z.object({ kind: z.literal("terminal"), tabId: z.string().min(1) }).strict(),
  z.object({ kind: z.literal("chat"), sessionId: z.string().min(1) }).strict(),
  z.object({ kind: z.literal("git_working") }).strict(),
  z
    .object({
      kind: z.literal("git_branch"),
      base: z.string().min(1).optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("browser"),
      artifactId: z.string().min(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal("skill"),
      skillId: z.string().min(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal("rule"),
      path: z.string().min(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal("selection"),
      path: z.string().min(1),
      startLine: z.number().int().positive(),
      endLine: z.number().int().positive(),
      contentHash: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
      /** Hash of `text`. The server drops the text when this does not match. */
      sliceHash: z.string().regex(/^sha256:[a-f0-9]{64}$/u).optional(),
      /** Selected editor text. Accepted only when it hashes to `sliceHash`. */
      text: z.string().max(16_000).optional(),
    })
    .strict(),
]);

export const PromptAttachmentSchema = z
  .object({
    id: z.string().min(1),
    ref: PromptContextRefSchema,
    label: z.string().min(1),
    resolved: z.lazy(() => ResolvedAttachmentPayloadSchema).optional(),
  })
  .strict();

export const ResolvedAttachmentPayloadSchema = z
  .object({
    ref: PromptContextRefSchema,
    label: z.string().min(1),
    disposition: LocalContextFileDispositionSchema,
    byteLength: z.number().int().nonnegative(),
    includedByteLength: z.number().int().nonnegative(),
    content: z.string().optional(),
    markdown: z.string().optional(),
    omissionReason: z.string().min(1).optional(),
    sha256: z
      .string()
      .regex(/^sha256:[a-f0-9]{64}$/u)
      .optional(),
    source: z.enum(["mention", "auto"]),
  })
  .strict();

export const ComposerDraftSchema = z
  .object({
    text: z.string(),
    attachments: z.array(PromptAttachmentSchema),
    invokedSkillId: z.string().min(1).optional(),
  })
  .strict();

export const PromptComposerFieldsSchema = z
  .object({
    attachments: z.array(PromptAttachmentSchema).optional(),
    invokedSkillId: z.string().min(1).optional(),
  })
  .strict();

export function emptyComposerDraft(text = ""): z.infer<typeof ComposerDraftSchema> {
  return { text, attachments: [] };
}

export function normalizeComposerDraft(
  value:
    | string
    | Partial<z.infer<typeof ComposerDraftSchema>>
    | undefined,
): z.infer<typeof ComposerDraftSchema> {
  if (!value) return emptyComposerDraft();
  if (typeof value === "string") return emptyComposerDraft(value);
  // Accept partial drafts (e.g. `{ text }` without attachments) from older
  // callers / session restores instead of throwing ZodError.
  return ComposerDraftSchema.parse({
    text: typeof value.text === "string" ? value.text : "",
    attachments: Array.isArray(value.attachments) ? value.attachments : [],
    ...(typeof value.invokedSkillId === "string" && value.invokedSkillId
      ? { invokedSkillId: value.invokedSkillId }
      : {}),
  });
}

export function buildPromptComposerFields(draft: ComposerDraft): PromptComposerFields {
  return {
    ...(draft.attachments.length > 0 ? { attachments: draft.attachments } : {}),
    ...(draft.invokedSkillId ? { invokedSkillId: draft.invokedSkillId } : {}),
  };
}

export type PromptContextRef = z.infer<typeof PromptContextRefSchema>;
export type PromptAttachment = z.infer<typeof PromptAttachmentSchema>;
export type ResolvedAttachmentPayload = z.infer<
  typeof ResolvedAttachmentPayloadSchema
>;
export type ComposerDraft = z.infer<typeof ComposerDraftSchema>;
export type PromptComposerFields = z.infer<typeof PromptComposerFieldsSchema>;
