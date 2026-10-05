import { z } from "zod";

import { InternalResourceKindSchema } from "./write-authorization.js";

const Sha256Schema = z.string().regex(/^sha256:[a-f0-9]{64}$/u);
const BackupIdSchema = z.string().regex(/^[A-Za-z0-9_-]+$/u);
const DesignPreviewMutationIdSchema = z.string().regex(/^pm1_[A-Za-z0-9_-]{43}$/u);

export const ApplyBackupRestoreAuthoritySchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("project_api"),
  }).strict(),
  z.object({
    kind: z.literal("design_preview"),
    previewSessionId: z.string().min(1).max(128),
    mutationId: DesignPreviewMutationIdSchema,
  }).strict(),
]);

export const TransactionGroupBackupMetadataSchema = z.object({
  planId: z.string().min(1),
  parentRunId: z.string().min(1),
  childRunIds: z.array(z.string().min(1)).min(1),
}).strict();

const ApplyBackupManifestV2Schema = z.object({
  version: z.literal(2),
  backupId: BackupIdSchema,
  runId: z.string().min(1),
  projectId: z.string().min(1),
  createdAt: z.string().min(1),
  transactionGroup: TransactionGroupBackupMetadataSchema.optional(),
  files: z.array(z.object({
    path: z.string().min(1),
    backupFile: z.string().regex(/^\d{4}\.original$/u),
    mode: z.number().int().nonnegative(),
    originalSha256: Sha256Schema,
    afterSha256: Sha256Schema,
  }).strict()).min(1),
}).strict();

const ApplyBackupCreateEntrySchema = z.object({
  operation: z.literal("create"),
  path: z.string().min(1),
  mode: z.number().int().nonnegative(),
  afterSha256: Sha256Schema,
}).strict();

const ApplyBackupModifyEntrySchema = z.object({
  operation: z.literal("modify"),
  path: z.string().min(1),
  backupFile: z.string().regex(/^\d{4}\.original$/u),
  mode: z.number().int().nonnegative(),
  originalSha256: Sha256Schema,
  afterSha256: Sha256Schema,
}).strict();

const ApplyBackupDeleteEntrySchema = z.object({
  operation: z.literal("delete"),
  path: z.string().min(1),
  backupFile: z.string().regex(/^\d{4}\.original$/u),
  mode: z.number().int().nonnegative(),
  originalSha256: Sha256Schema,
}).strict();

const ApplyBackupInternalEntrySchema = z.object({
  operation: z.literal("internal"),
  resource: InternalResourceKindSchema,
  path: z.string().min(1),
  backupFile: z.string().regex(/^\d{4}\.original$/u).optional(),
  mode: z.number().int().nonnegative(),
  existedBefore: z.boolean(),
  resultedExists: z.boolean(),
  originalSha256: Sha256Schema.optional(),
  afterSha256: Sha256Schema.optional(),
}).strict();

const ApplyBackupFilesSchema = z.array(z.discriminatedUnion("operation", [
  ApplyBackupCreateEntrySchema,
  ApplyBackupModifyEntrySchema,
  ApplyBackupDeleteEntrySchema,
  ApplyBackupInternalEntrySchema,
])).min(1);

function validateInternalBackupMetadata(
  manifest: { files: z.infer<typeof ApplyBackupFilesSchema> },
  ctx: z.RefinementCtx,
): void {
  manifest.files.forEach((entry, index) => {
    if (
      entry.operation === "internal" &&
      Boolean(entry.backupFile) !== Boolean(entry.originalSha256)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["files", index, "backupFile"],
        message: "Internal-resource backup identity fields must be all present or all absent",
      });
    }
    if (
      entry.operation === "internal" &&
      (
        entry.existedBefore !== Boolean(entry.backupFile && entry.originalSha256) ||
        entry.resultedExists !== Boolean(entry.afterSha256)
      )
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["files", index, "existedBefore"],
        message: "Internal-resource backup metadata is inconsistent",
      });
    }
  });
}

export const ApplyBackupManifestV3Schema = z.object({
  version: z.literal(3),
  backupId: BackupIdSchema,
  runId: z.string().min(1),
  projectId: z.string().min(1),
  createdAt: z.string().min(1),
  transactionGroup: TransactionGroupBackupMetadataSchema.optional(),
  files: ApplyBackupFilesSchema,
}).strict().superRefine(validateInternalBackupMetadata);

export const ApplyBackupManifestV4Schema = z.object({
  version: z.literal(4),
  backupId: BackupIdSchema,
  runId: z.string().min(1),
  projectId: z.string().min(1),
  createdAt: z.string().min(1),
  transactionGroup: TransactionGroupBackupMetadataSchema.optional(),
  restoreAuthority: ApplyBackupRestoreAuthoritySchema,
  files: ApplyBackupFilesSchema,
}).strict().superRefine(validateInternalBackupMetadata);

export const ApplyBackupManifestWithOperationsSchema = z.union([
  ApplyBackupManifestV4Schema,
  ApplyBackupManifestV3Schema,
]);

export const ApplyBackupManifestSchema = z.union([
  ApplyBackupManifestV4Schema,
  ApplyBackupManifestV3Schema,
  ApplyBackupManifestV2Schema,
]);

export type ApplyBackupManifest = z.infer<typeof ApplyBackupManifestSchema>;
export type ApplyBackupManifestV3 = z.infer<typeof ApplyBackupManifestV3Schema>;
export type ApplyBackupManifestV4 = z.infer<typeof ApplyBackupManifestV4Schema>;
export type ApplyBackupManifestWithOperations = z.infer<
  typeof ApplyBackupManifestWithOperationsSchema
>;
export type ApplyBackupRestoreAuthority = z.infer<
  typeof ApplyBackupRestoreAuthoritySchema
>;

export type ApplyBackupRestoreClassification =
  | {
      state: "authoritative";
      authority: ApplyBackupRestoreAuthority;
    }
  | {
      state: "legacy_unclassified";
      manifestVersion: 2 | 3;
    };

export function classifyApplyBackupRestoreAuthority(
  manifest: ApplyBackupManifest,
): ApplyBackupRestoreClassification {
  return manifest.version === 4
    ? { state: "authoritative", authority: manifest.restoreAuthority }
    : { state: "legacy_unclassified", manifestVersion: manifest.version };
}

export type TransactionGroupBackupMetadata = z.infer<
  typeof TransactionGroupBackupMetadataSchema
>;
