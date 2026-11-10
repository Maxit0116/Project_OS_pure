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
 * Honest parse *level* for materials.
 * - text_preview: capped plaintext only (not full ingest)
 * - structured_selection: CSV/XLSX column/sheet/row range applied into preview + run snapshot
 * - full_text_parse: PDF/page (or other) text extract — claim only when extract succeeded
 * - vision_attach: image bytes wired to ModelGateway images[] (requires vision-capable apiFormat)
 * - unsupported: deferred / blocked — safety state, not “feature done”
 */
export const LoopTaskMaterialParseLevelSchema = z.enum([
  "text_preview",
  "structured_selection",
  "full_text_parse",
  "vision_attach",
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
    /**
     * Table / sheet selection — when set, must reshape textPreview and the
     * material snapshot sent to bound nodes (not UI-only).
     */
    tablePreview: z
      .object({
        sheet: z.string().trim().min(1).max(120).optional(),
        columns: z.array(z.string().trim().min(1).max(120)).max(64).optional(),
        rowRange: z.string().trim().min(1).max(40).optional(),
        rowStart: z.number().int().positive().max(1_000_000).optional(),
        rowEnd: z.number().int().positive().max(1_000_000).optional(),
        role: z.enum(["requirement", "test", "business"]).optional(),
      })
      .strict()
      .optional(),
    /** PDF page selection (1-based inclusive) — applies when full_text_parse succeeds. */
    pdfPreview: z
      .object({
        pageStart: z.number().int().positive().max(10_000).optional(),
        pageEnd: z.number().int().positive().max(10_000).optional(),
        pageCount: z.number().int().nonnegative().max(10_000).optional(),
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

export const LoopRepoIdentityKindSchema = z.enum([
  "git_remote",
  "git_local",
  "workspace_path",
  "unbound",
]);

export const LoopBranchSourceSchema = z.enum([
  "verified_git",
  "declared_unverified",
  "none",
]);

export const LoopFrozenRunBudgetSchema = z
  .object({
    maxRounds: z.number().int().positive(),
    maxRetries: z.number().int().nonnegative(),
    maxAgentCalls: z.number().int().positive(),
    maxAgentCallDepth: z.number().int().positive(),
  })
  .strict();

export const LoopFrozenPermissionSetSchema = z
  .object({
    /** Credential refs only — never tokens. */
    credentialRefIds: z.array(z.string().min(1).max(120)).max(32),
    requireHitlForHighRisk: z.literal(true),
  })
  .strict();

export const LoopRunBindingSchema = z
  .object({
    projectId: z.string().min(1),
    workspaceRoot: z.string().min(1).optional(),
    /**
     * Repo identity string: git remote URL, `git-local:…@sha`, or `workspace:<abs>`.
     * Never a bare folder basename pretending to be a git remote.
     */
    repo: z.string().trim().min(1).max(500).optional(),
    identityKind: LoopRepoIdentityKindSchema.optional(),
    remoteUrl: z.string().trim().min(1).max(500).optional(),
    headSha: z.string().trim().min(7).max(64).optional(),
    branch: z.string().trim().min(1).max(240).optional(),
    branchSource: LoopBranchSourceSchema.optional(),
    /** UI/event declared branch when it differs from verified git branch. */
    declaredBranch: z.string().trim().min(1).max(240).optional(),
    /**
     * Content digest of workspace code at start.
     * Must never be a path-only identity hash pretending to be complete content.
     */
    codeDigest: z.string().trim().min(1).max(128).optional(),
    /**
     * complete = digest covers readable content within caps;
     * incomplete = truncated / oversized / unreadable — blocks production start.
     */
    codeDigestStatus: z.enum(["complete", "incomplete"]).optional(),
    incompleteReasons: z.array(z.string().trim().min(1).max(200)).max(20).optional(),
    /**
     * Identity fingerprint (path/remote) — NOT interchangeable with codeDigest.
     * Non-git workspaces: identityDigest ≠ codeDigest.
     */
    identityDigest: z.string().trim().min(1).max(128).optional(),
    /** Content digest of dirty/untracked (or clean marker). */
    workspaceDirtyDigest: z.string().trim().min(1).max(128).optional(),
    definitionDigest: z.string().trim().min(1).max(128).optional(),
    materialsDigest: z.string().trim().min(1).max(128).optional(),
    specVersion: z.string().min(1),
    taskInputId: z.string().min(1).optional(),
    materials: z.array(LoopTaskMaterialSchema).max(64).optional(),
    credentialRefIds: z.array(z.string().min(1).max(120)).max(32).optional(),
    /** Frozen from Spec at start — definition edits must not rewrite this. */
    budget: LoopFrozenRunBudgetSchema.optional(),
    /** Frozen permission/credential policy at start. */
    permissionSet: LoopFrozenPermissionSetSchema.optional(),
    /** Human-readable preflight checklist snapshot at confirm time. */
    preflightNotes: z.array(z.string().trim().min(1).max(500)).max(40).optional(),
    createdAt: z.string().min(1),
  })
  .strict();

export type LoopTaskMaterial = z.infer<typeof LoopTaskMaterialSchema>;
export type LoopRunBinding = z.infer<typeof LoopRunBindingSchema>;
export type LoopTaskMaterialKind = z.infer<typeof LoopTaskMaterialKindSchema>;
export type LoopTaskMaterialParseLevel = z.infer<
  typeof LoopTaskMaterialParseLevelSchema
>;
