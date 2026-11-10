/**
 * Loop task / run materials — separate from Ask/Edit authoring inputs.
 * Uploading materials must not silently mutate Intent definitions.
 */
import { z } from "zod";

export const LoopTaskMaterialKindSchema = z.enum([
  "text",
  "image",
  "file",
  "table",
  "url",
  "project_ref",
]);

export const LoopTaskMaterialPurposeSchema = z.enum([
  "requirement",
  "design",
  "error_screenshot",
  "api_doc",
  "log",
  "test_data",
  "business_data",
  "issue_or_pr",
  "code_context",
  "other",
]);

export const LoopTaskMaterialParseStatusSchema = z.enum([
  "pending",
  "partial",
  "ok",
  "unsupported",
  "failed",
]);

/**
 * Honest parse *level* for first-batch materials.
 * - text_preview: capped plaintext preview only (not full ingest, not structured select)
 * - unsupported: deferred format (image/xlsx/pdf/…) — safety state, not “feature done”
 * full_text_parse / structured_selection are **not implemented** yet — do not claim them.
 */
export const LoopTaskMaterialParseLevelSchema = z.enum([
  "text_preview",
  "unsupported",
]);

export const LoopTaskMaterialSourceSchema = z.enum([
  "upload",
  "paste",
  "project_ref",
  "url",
  "composer_text",
  /** Gmail message body or attachment mapped into a run material. */
  "gmail",
]);

export const LoopTaskMaterialSchema = z
  .object({
    id: z.string().min(1),
    kind: LoopTaskMaterialKindSchema,
    purpose: LoopTaskMaterialPurposeSchema,
    title: z.string().trim().min(1).max(240),
    /** Optional binding to Intent/Spec node ids — does not rewrite the definition. */
    bindingNodeIds: z.array(z.string().min(1)).max(32).optional(),
    source: LoopTaskMaterialSourceSchema,
    /** Opaque content ref (workspace-relative or blob id) — never embed secrets. */
    contentRef: z.string().trim().min(1).max(500).optional(),
    bytesHash: z.string().trim().min(1).max(128).optional(),
    version: z.number().int().positive().max(1_000_000).optional(),
    parseStatus: LoopTaskMaterialParseStatusSchema.default("pending"),
    parseMessage: z.string().trim().max(500).optional(),
    /**
     * Capability level actually provided (see LoopTaskMaterialParseLevelSchema).
     * CSV at text_preview ≠ sheet/column/range structured selection.
     */
    parseLevel: LoopTaskMaterialParseLevelSchema.optional(),
    /** Table preview metadata (CSV/XLSX) — only when structured_selection exists (not yet). */
    tablePreview: z
      .object({
        sheet: z.string().trim().min(1).max(120).optional(),
        columns: z.array(z.string().trim().min(1).max(120)).max(64).optional(),
        rowRange: z.string().trim().min(1).max(40).optional(),
        role: z.enum(["requirement", "test", "business"]).optional(),
      })
      .strict()
      .optional(),
    url: z
      .object({
        href: z.string().url().max(2000),
        declaredHost: z.string().trim().min(1).max(253).optional(),
        authState: z
          .enum(["none", "ok", "failed", "denied_ssrf"])
          .optional(),
      })
      .strict()
      .optional(),
    projectRef: z
      .object({
        path: z.string().trim().min(1).max(500),
        kind: z.enum(["file", "dir", "c4_node", "test"]).optional(),
        nodeId: z.string().min(1).optional(),
      })
      .strict()
      .optional(),
    /**
     * Gmail provenance — credential account ref + message/thread/attachment ids.
     * Bound to the run snapshot; never implies live send or mailbox mutation.
     */
    gmail: z
      .object({
        accountRefId: z.string().trim().min(1).max(120),
        messageId: z.string().trim().min(1).max(200).optional(),
        threadId: z.string().trim().min(1).max(200).optional(),
        attachmentId: z.string().trim().min(1).max(200).optional(),
        /** Mailbox historyId observed when material was captured (poll/push sync). */
        historyId: z.string().trim().min(1).max(64).optional(),
      })
      .strict()
      .optional(),
    /** When true, applies only to this run and must not write back to definition. */
    runOverride: z.boolean().optional(),
    sizeBytes: z.number().int().nonnegative().max(50_000_000).optional(),
    /**
     * Measured byte length when known (may differ from provider-declared size).
     * Never silently clamp declared size to pretend compliance.
     */
    measuredSizeBytes: z.number().int().nonnegative().max(100_000_000).optional(),
    /**
     * Capped plaintext preview for run UI — not a substitute for contentRef bytes.
     * HTML bodies must be reduced to plain text before landing here.
     */
    textPreview: z.string().max(8_000).optional(),
    mimeType: z.string().trim().min(1).max(120).optional(),
    charset: z.string().trim().min(1).max(40).optional(),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1).optional(),
  })
  .strict();

export const LoopRunBindingSchema = z
  .object({
    projectId: z.string().min(1),
    workspaceRoot: z.string().min(1).optional(),
    repo: z.string().trim().min(1).max(240).optional(),
    branch: z.string().trim().min(1).max(240).optional(),
    codeDigest: z.string().trim().min(1).max(128).optional(),
    specVersion: z.string().min(1),
    taskInputId: z.string().min(1).optional(),
    materials: z.array(LoopTaskMaterialSchema).max(64).optional(),
    credentialRefIds: z.array(z.string().min(1).max(120)).max(32).optional(),
    /** Human-readable preflight checklist snapshot at confirm time. */
    preflightNotes: z.array(z.string().trim().min(1).max(500)).max(40).optional(),
    createdAt: z.string().min(1),
  })
  .strict();

export type LoopTaskMaterial = z.infer<typeof LoopTaskMaterialSchema>;
export type LoopRunBinding = z.infer<typeof LoopRunBindingSchema>;
export type LoopTaskMaterialKind = z.infer<typeof LoopTaskMaterialKindSchema>;
