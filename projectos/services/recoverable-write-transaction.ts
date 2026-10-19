import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  fchmodSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { z } from "zod";

import type {
  CreateWriteAuthorization,
  ExistingFileWriteAuthorization,
  InternalResourceWriteAuthorization,
  WriteAuthorization,
} from "../contracts/write-authorization.js";
import {
  CreateWriteAuthorizationSchema,
  ExistingFileWriteAuthorizationSchema,
  InternalResourceWriteAuthorizationSchema,
  WriteAuthorizationSchema,
} from "../contracts/write-authorization.js";
import type { InternalResourceKind } from "../contracts/write-authorization.js";
import {
  ApplyBackupManifestSchema,
  ApplyBackupManifestV3Schema,
  ApplyBackupManifestV4Schema,
  ApplyBackupManifestWithOperationsSchema,
  type ApplyBackupManifest,
  type ApplyBackupManifestV3,
  type ApplyBackupManifestV4,
  type ApplyBackupManifestWithOperations,
  type ApplyBackupRestoreAuthority,
  type TransactionGroupBackupMetadata,
} from "../contracts/write-transaction.js";
import { ProjectOSError } from "../errors.js";
import { appendRetrievalChangeFeed } from "./retrieval/code-index.js";
import { resolveContainedPath } from "../utils/path-containment.js";
import { withProjectWriteTransactionLock } from "./project-write-transaction-lock.js";

export { withProjectWriteTransactionLock } from "./project-write-transaction-lock.js";

const BackupIdSchema = z.string().regex(/^[A-Za-z0-9_-]+$/u);
export {
  ApplyBackupManifestSchema,
  ApplyBackupManifestV3Schema,
  ApplyBackupManifestV4Schema,
  ApplyBackupManifestWithOperationsSchema,
};
export type {
  ApplyBackupManifest,
  ApplyBackupManifestV3,
  ApplyBackupManifestV4,
  ApplyBackupManifestWithOperations,
  ApplyBackupRestoreAuthority,
};

const JournalStateSchema = z.enum([
  "prepared",
  "committing",
  "awaiting_acceptance",
  "committed",
  "rolling_back",
  "recovery_required",
]);

const TransactionJournalSchema = z.object({
  version: z.literal(1),
  backupId: BackupIdSchema,
  runId: z.string().min(1),
  projectId: z.string().min(1),
  state: JournalStateSchema,
  updatedAt: z.string().min(1),
  entries: z.array(z.object({
    path: z.string().min(1),
    operation: z.enum(["create", "modify", "delete", "internal"]),
    authorization: WriteAuthorizationSchema,
    temporaryPath: z.string().optional(),
    committed: z.boolean(),
  }).strict()).min(1),
}).strict();

type TransactionJournal = z.infer<typeof TransactionJournalSchema>;

export interface AuthorizedWriteOperation {
  authorization: WriteAuthorization;
  beforeBytes?: Uint8Array;
  afterBytes?: Uint8Array;
  mode?: number;
}

export interface WriteTransactionRequest {
  runId: string;
  projectId: string;
  workspaceRoot: string;
  projectOSRoot: string;
  operations: AuthorizedWriteOperation[];
  restoreAuthority: ApplyBackupRestoreAuthority;
  transactionGroup?: TransactionGroupBackupMetadata;
  beforeCommit?: () => void | Promise<void>;
  acceptCommitted?: (
    result: WriteTransactionResult & { outcome: "committed" },
  ) => void | (() => void);
}

export interface WriteTransactionResult {
  backupId: string;
  outcome: "committed" | "recovery_required";
  filesChanged: string[];
  recoveryFailedPaths?: string[];
}

export interface RecoveryResult {
  backupId: string;
  outcome: "rolled_back" | "recovery_required";
  failedPaths: string[];
}

interface PreparedOperation {
  authorization: WriteAuthorization;
  targetPath: string;
  beforeBytes?: Uint8Array;
  afterBytes?: Uint8Array;
  mode: number;
  backupFile?: string;
  temporaryPath?: string;
  originalSha256?: string;
  afterSha256?: string;
}

export interface WriteTransactionPrimitives {
  replace(temporaryPath: string, targetPath: string): void;
  createNoClobber(temporaryPath: string, targetPath: string): void;
  remove(targetPath: string): void;
}

const defaultPrimitives: WriteTransactionPrimitives = {
  replace: renameSync,
  createNoClobber: commitCreateNoClobber,
  remove: unlinkSync,
};

export function commitCreateNoClobber(temporaryPath: string, targetPath: string): void {
  linkSync(temporaryPath, targetPath);
  unlinkSync(temporaryPath);
}

export class RecoverableWriteTransactionKernel {
  private readonly primitives: WriteTransactionPrimitives;

  constructor(primitives: Partial<WriteTransactionPrimitives> = {}) {
    this.primitives = { ...defaultPrimitives, ...primitives };
  }

  async execute(request: WriteTransactionRequest): Promise<WriteTransactionResult> {
    return withProjectWriteTransactionLock(
      resolveContainedPath(request.workspaceRoot, "."),
      async () => this.executeLocked(request),
    );
  }

  async recoverPendingTransactions(
    workspaceRoot: string,
    projectOSRoot: string,
    projectId: string,
  ): Promise<RecoveryResult[]> {
    const canonicalWorkspaceRoot = resolveContainedPath(workspaceRoot, ".");
    return withProjectWriteTransactionLock(
      canonicalWorkspaceRoot,
      async () => this.recoverPendingTransactionsLocked(
        canonicalWorkspaceRoot,
        projectOSRoot,
        projectId,
      ),
    );
  }

  private recoverPendingTransactionsLocked(
    canonicalWorkspaceRoot: string,
    projectOSRoot: string,
    projectId: string,
  ): RecoveryResult[] {
    const backupsRoot = join(projectOSRoot, "apply-backups");
    if (!existsSync(backupsRoot)) return [];
    const results: RecoveryResult[] = [];
    for (const backupId of readdirSync(backupsRoot).sort()) {
      const backupRoot = join(backupsRoot, backupId);
      sweepOrphanedBackupTemps(backupRoot);
      const journalPath = join(backupRoot, "transaction-journal.json");
      if (!existsSync(journalPath)) continue;
      let journal: TransactionJournal;
      let manifest: ApplyBackupManifestWithOperations;
      try {
        journal = TransactionJournalSchema.parse(JSON.parse(readFileSync(journalPath, "utf8")));
        manifest = ApplyBackupManifestWithOperationsSchema.parse(JSON.parse(
          readFileSync(join(backupRoot, "manifest.json"), "utf8"),
        ));
      } catch {
        const failedPaths = ["transaction_metadata"];
        writeRecoveryManifest(backupRoot, {
          runId: "unknown",
          projectId,
        }, backupId, failedPaths);
        results.push({ backupId, outcome: "recovery_required", failedPaths });
        continue;
      }
      if (journal.projectId !== projectId || manifest.projectId !== projectId) continue;
      if (journal.state === "committed") {
        removeFileIfPresent(journalPath);
        continue;
      }
      if (journal.state === "recovery_required") {
        results.push({
          backupId: journal.backupId,
          outcome: "recovery_required",
          failedPaths: manifest.files.map((file) => file.path),
        });
        continue;
      }
      try {
        results.push(this.recoverOne(canonicalWorkspaceRoot, backupRoot, journal, manifest));
      } catch {
        const failedPaths = manifest.files.map((file) => file.path);
        writeRecoveryManifest(backupRoot, {
          runId: journal.runId,
          projectId: journal.projectId,
        }, journal.backupId, failedPaths);
        try {
          updateJournal(journalPath, journal, { state: "recovery_required" });
        } catch {
          // The recovery manifest remains the durable manual-recovery signal.
        }
        results.push({
          backupId: journal.backupId,
          outcome: "recovery_required",
          failedPaths,
        });
      }
    }
    return results;
  }

  private async executeLocked(request: WriteTransactionRequest): Promise<WriteTransactionResult> {
    if (request.operations.length === 0) {
      throw new ProjectOSError("diff_apply_unsupported", "A transaction requires at least one operation");
    }
    const workspaceRoot = resolveContainedPath(request.workspaceRoot, ".");
    const projectOSRoot = resolveContainedPath(request.projectOSRoot, ".");
    if (projectOSRoot !== resolveContainedPath(workspaceRoot, ".projectos")) {
      throw new ProjectOSError(
        "diff_scope_violation",
        "Transaction journal root does not belong to the authorized workspace",
      );
    }
    if (request.projectId.trim().length === 0 || request.runId.trim().length === 0) {
      throw new ProjectOSError("diff_apply_failed", "Transaction identity is invalid");
    }
    const backupId = globalThis.crypto.randomUUID();
    const backupRoot = join(projectOSRoot, "apply-backups", backupId);
    const prepared = request.operations.map((operation, index) =>
      prepareOperation(workspaceRoot, request.projectId, operation, backupId, index));
    assertDistinctOperations(prepared);
    for (const plan of prepared) assertOperationUnchanged(workspaceRoot, plan);
    await request.beforeCommit?.();
    mkdirSync(backupRoot, { recursive: true });
    fsyncDirectory(dirname(backupRoot));
    fsyncDirectory(dirname(dirname(backupRoot)));

    const manifest = buildManifest(request, backupId, prepared);
    writeExclusiveDurableJson(join(backupRoot, "manifest.json"), manifest);
    const journalPath = join(backupRoot, "transaction-journal.json");
    let journal: TransactionJournal = {
      version: 1,
      backupId,
      runId: request.runId,
      projectId: request.projectId,
      state: "prepared",
      updatedAt: new Date().toISOString(),
      entries: prepared.map((plan) => ({
        path: plan.authorization.relativePath,
        operation: plan.authorization.operation,
        authorization: plan.authorization,
        ...(plan.temporaryPath ? { temporaryPath: plan.temporaryPath } : {}),
        committed: false,
      })),
    };
    writeExclusiveDurableJson(journalPath, journal);
    let compensateAcceptance: (() => void) | undefined;

    try {
      for (const plan of prepared) {
        if (plan.afterBytes) {
          writeExclusiveDurableFile(plan.temporaryPath!, plan.afterBytes!, plan.mode);
        }
        if (plan.backupFile) {
          writeExclusiveDurableFile(
            join(backupRoot, plan.backupFile!),
            plan.beforeBytes!,
            0o600,
          );
        }
      }
      journal = updateJournal(journalPath, journal, { state: "committing" });
      for (const [index, plan] of prepared.entries()) {
        assertOperationUnchanged(workspaceRoot, plan);
        commitOperation(this.primitives, plan);
        journal.entries[index]!.committed = true;
        journal = updateJournal(journalPath, journal, {});
      }
      journal = updateJournal(journalPath, journal, { state: "awaiting_acceptance" });
      const committed = {
        backupId,
        outcome: "committed" as const,
        filesChanged: prepared.map(pathOf),
      };
      const compensation = request.acceptCommitted?.(committed);
      if (compensation !== undefined && typeof compensation !== "function") {
        throw new ProjectOSError(
          "diff_apply_failed",
          "Transaction acceptance must complete synchronously",
        );
      }
      compensateAcceptance = typeof compensation === "function" ? compensation : undefined;
      updateJournal(journalPath, journal, { state: "committed" });
      try {
        appendRetrievalChangeFeed(
          request.projectOSRoot,
          prepared.flatMap((plan) => {
            if (plan.authorization.operation === "internal") return [];
            return [{
              path: pathOf(plan),
              ...(plan.afterSha256 ? { sha256: plan.afterSha256 } : {}),
              ...(plan.authorization.operation === "delete" ? { deleted: true } : {}),
            }];
          }),
        );
      } catch {
        // A feed failure must not roll back a commit. Retrieval still
        // refuses quotes whose file hash no longer matches.
      }
      return committed;
    } catch (error) {
      for (const plan of prepared) removeFileIfPresent(plan.temporaryPath);
      try {
        journal = updateJournal(journalPath, journal, { state: "rolling_back" });
      } catch {
        // The on-disk journal still describes a recoverable pre-terminal state.
      }
      const rollbackState = prepared.map((plan, index) => {
        if (journal.entries[index]?.committed === true) return true;
        return inferOperationCommitState(plan) === "landed";
      });
      const failedPaths = rollbackPrepared(
        this.primitives,
        backupRoot,
        prepared,
        rollbackState,
      );
      if (failedPaths.length === 0 && compensateAcceptance) {
        try {
          compensateAcceptance();
        } catch {
          failedPaths.push("transaction_acceptance");
        }
      }
      if (failedPaths.length > 0) {
        updateJournal(journalPath, journal, { state: "recovery_required" });
        writeRecoveryManifest(backupRoot, request, backupId, failedPaths);
        return {
          backupId,
          outcome: "recovery_required",
          filesChanged: failedPaths,
          recoveryFailedPaths: failedPaths,
        };
      }
      removeFileIfPresent(journalPath);
      if (error instanceof ProjectOSError) throw error;
      throw new ProjectOSError(
        "diff_apply_failed",
        `Transaction failed; source files were restored from backup '${backupId}'.`,
        { cause: error },
      );
    }
  }

  private recoverOne(
    workspaceRoot: string,
    backupRoot: string,
    journal: TransactionJournal,
    manifest: ApplyBackupManifestWithOperations,
  ): RecoveryResult {
    if (journal.state === "prepared") {
      for (const entry of journal.entries) removeFileIfPresent(entry.temporaryPath);
      removeFileIfPresent(join(backupRoot, "transaction-journal.json"));
      return { backupId: journal.backupId, outcome: "rolled_back", failedPaths: [] };
    }
    const entries = manifest.files.map((file, index) => ({
      authorization: journal.entries[index]!.authorization,
      targetPath: resolve(workspaceRoot, file.path),
      mode: file.mode,
      ...("backupFile" in file && file.backupFile
        ? {
            backupFile: file.backupFile,
            beforeBytes: readFileSync(join(backupRoot, file.backupFile), { encoding: null }),
            originalSha256: file.originalSha256,
          }
        : {}),
      ...("afterSha256" in file && file.afterSha256
        ? { afterSha256: file.afterSha256 }
        : {}),
    })) as PreparedOperation[];
    const invalidAuthorizationPaths = entries.flatMap((entry, index) => {
      const file = manifest.files[index]!;
      const authorization = entry.authorization;
      return authorization.projectId !== manifest.projectId ||
          authorization.workspaceRoot !== workspaceRoot ||
          authorization.relativePath !== file.path ||
          authorization.operation !== file.operation ||
          !recoveryAuthorizationStillAddressesTarget(workspaceRoot, authorization)
        ? [file.path]
        : [];
    });
    if (invalidAuthorizationPaths.length > 0) {
      writeRecoveryManifest(backupRoot, {
        runId: journal.runId,
        projectId: journal.projectId,
      }, journal.backupId, invalidAuthorizationPaths);
      return {
        backupId: journal.backupId,
        outcome: "recovery_required",
        failedPaths: invalidAuthorizationPaths,
      };
    }
    const inferred = entries.map((entry, index) => {
      if (journal.state === "prepared") return "not_landed" as const;
      if (journal.entries[index]?.committed === true) return "landed" as const;
      return inferOperationCommitState(entry);
    });
    const ambiguousPaths = inferred.flatMap((state, index) =>
      state === "ambiguous" ? [entries[index]!.authorization.relativePath] : []);
    if (ambiguousPaths.length > 0) {
      const recoveryJournal = TransactionJournalSchema.parse({
        ...journal,
        state: "recovery_required",
        updatedAt: new Date().toISOString(),
      });
      writeDurableJsonReplacing(join(backupRoot, "transaction-journal.json"), recoveryJournal);
      writeRecoveryManifest(backupRoot, {
        runId: journal.runId,
        projectId: journal.projectId,
      }, journal.backupId, ambiguousPaths);
      return {
        backupId: journal.backupId,
        outcome: "recovery_required",
        failedPaths: ambiguousPaths,
      };
    }
    const landed = inferred.map((state) => state === "landed");
    updateJournal(join(backupRoot, "transaction-journal.json"), journal, {
      state: "rolling_back",
    });
    const failedPaths = rollbackPrepared(
      this.primitives,
      backupRoot,
      entries,
      landed,
    );
    for (const entry of journal.entries) removeFileIfPresent(entry.temporaryPath);
    if (failedPaths.length === 0) {
      removeFileIfPresent(join(backupRoot, "transaction-journal.json"));
      return { backupId: journal.backupId, outcome: "rolled_back", failedPaths: [] };
    }
    const recoveryJournal = TransactionJournalSchema.parse({
      ...journal,
      state: "recovery_required",
      updatedAt: new Date().toISOString(),
    });
    writeDurableJsonReplacing(join(backupRoot, "transaction-journal.json"), recoveryJournal);
    writeRecoveryManifest(backupRoot, {
      runId: journal.runId,
      projectId: journal.projectId,
    }, journal.backupId, failedPaths);
    return { backupId: journal.backupId, outcome: "recovery_required", failedPaths };
  }
}

export function bindExistingFileAuthorization(input: {
  operation: "modify" | "delete";
  projectId: string;
  nodeId: string;
  workspaceRoot: string;
  relativePath: string;
}): ExistingFileWriteAuthorization {
  const root = resolveContainedPath(input.workspaceRoot, ".");
  assertSafeRelativePath(input.relativePath);
  assertNotProtected(input.relativePath);
  assertNoSymlinkComponents(root, input.relativePath);
  const canonicalPath = resolveContainedPath(root, input.relativePath);
  const stats = lstatSync(canonicalPath);
  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw new ProjectOSError("diff_apply_unsupported", `Target '${input.relativePath}' must be a regular file`);
  }
  return ExistingFileWriteAuthorizationSchema.parse({
    ...input,
    workspaceRoot: root,
    canonicalPath,
    device: stats.dev,
    inode: stats.ino,
    boundSha256: sha256(readFileSync(canonicalPath, { encoding: null })),
  });
}

export function bindCreateAuthorization(input: {
  projectId: string;
  nodeId: string;
  workspaceRoot: string;
  relativePath: string;
}): CreateWriteAuthorization {
  const root = resolveContainedPath(input.workspaceRoot, ".");
  assertSafeRelativePath(input.relativePath);
  assertNotProtected(input.relativePath);
  const name = basename(input.relativePath);
  if (name !== input.relativePath && dirname(input.relativePath) === ".") {
    throw new ProjectOSError("diff_apply_unsupported", `Create target '${input.relativePath}' is invalid`);
  }
  const parentRelative = dirname(input.relativePath);
  assertNoSymlinkComponents(root, parentRelative === "." ? "" : parentRelative);
  const parentCanonicalPath = resolveContainedPath(root, parentRelative);
  const parentStats = lstatSync(parentCanonicalPath);
  if (!parentStats.isDirectory() || parentStats.isSymbolicLink()) {
    throw new ProjectOSError("diff_apply_unsupported", "Create parent must be an existing regular directory");
  }
  const targetPath = join(parentCanonicalPath, name);
  if (existsSync(targetPath)) {
    throw new ProjectOSError("diff_stale", `Create target '${input.relativePath}' already exists`);
  }
  return CreateWriteAuthorizationSchema.parse({
    operation: "create",
    ...input,
    workspaceRoot: root,
    parentCanonicalPath,
    parentDevice: parentStats.dev,
    parentInode: parentStats.ino,
    basename: name,
  });
}

const INTERNAL_RESOURCE_PATHS: Record<InternalResourceKind, string> = {
  graph_product_overlay: ".projectos/graph-product-overlay.json",
  semantic_tree: ".projectos/semantic-tree.json",
  current_work: ".projectos/current-work.json",
  design_block_document: "",
  design_block_manifest: "",
  design_block_history: "",
  design_block_snapshot: "",
  design_block_recovery: "",
  design_block_ownership: "",
};

const DESIGN_BLOCK_DOCUMENT_PATH =
  /^projectos-design\/documents\/doc1_[a-z0-9]+(?:_[a-z0-9]+)*\.blocks\.json$/u;
const DESIGN_BLOCK_MANIFEST_PATH =
  /^\.projectos\/design-preview\/generated\/doc1_[a-z0-9]+(?:_[a-z0-9]+)*\.manifest\.json$/u;
const DESIGN_BLOCK_HISTORY_PATH =
  /^\.projectos\/design-preview\/history\/doc1_[a-z0-9]+(?:_[a-z0-9]+)*\.history\.json$/u;
const DESIGN_BLOCK_SNAPSHOT_PATH =
  /^\.projectos\/design-preview\/snapshots\/doc1_[a-z0-9]+(?:_[a-z0-9]+)*\.snapshot\.json$/u;
const DESIGN_BLOCK_RECOVERY_PATH =
  /^\.projectos\/design-preview\/recovery\/doc1_[a-z0-9]+(?:_[a-z0-9]+)*\/[A-Za-z0-9][A-Za-z0-9._-]{0,127}-external\.patch$/u;
const DESIGN_BLOCK_OWNERSHIP_PATH =
  /^projectos-design\/ownership\/doc1_[a-z0-9]+(?:_[a-z0-9]+)*\.ownership\.json$/u;

export function bindInternalResourceAuthorization(input: {
  resource: InternalResourceKind;
  projectId: string;
  workspaceRoot: string;
  relativePath?: string;
}): InternalResourceWriteAuthorization {
  const root = resolveContainedPath(input.workspaceRoot, ".");
  const relativePath = resolveInternalResourceRelativePath(
    input.resource,
    input.relativePath,
  );
  const parentRelativePath = dirname(relativePath);
  assertNoSymlinkComponents(root, parentRelativePath);
  const parentCanonicalPath = resolveContainedPath(root, parentRelativePath);
  const parentStats = lstatSync(parentCanonicalPath);
  if (!parentStats.isDirectory() || parentStats.isSymbolicLink()) {
    throw new ProjectOSError("diff_scope_violation", "Internal resource root is invalid");
  }
  const targetPath = join(parentCanonicalPath, basename(relativePath));
  const existedAtBind = existsSync(targetPath);
  const targetStats = existedAtBind ? lstatSync(targetPath) : undefined;
  if (targetStats && (!targetStats.isFile() || targetStats.isSymbolicLink())) {
    throw new ProjectOSError("diff_scope_violation", "Internal resource must be a regular file");
  }
  return InternalResourceWriteAuthorizationSchema.parse({
    operation: "internal",
    resource: input.resource,
    projectId: input.projectId,
    workspaceRoot: root,
    relativePath,
    targetPath,
    parentCanonicalPath,
    parentDevice: parentStats.dev,
    parentInode: parentStats.ino,
    existedAtBind,
    ...(targetStats
      ? {
          device: targetStats.dev,
          inode: targetStats.ino,
          boundSha256: sha256(readFileSync(targetPath, { encoding: null })),
        }
      : {}),
  });
}

export function readApplyBackupManifest(backupRoot: string): ApplyBackupManifest {
  return ApplyBackupManifestSchema.parse(JSON.parse(
    readFileSync(join(backupRoot, "manifest.json"), "utf8"),
  ));
}

function prepareOperation(
  workspaceRoot: string,
  projectId: string,
  operation: AuthorizedWriteOperation,
  backupId: string,
  index: number,
): PreparedOperation {
  const authorization = WriteAuthorizationSchema.parse(operation.authorization);
  if (authorization.projectId !== projectId || authorization.workspaceRoot !== workspaceRoot) {
    throw new ProjectOSError("diff_scope_violation", "Write authorization does not belong to this workspace");
  }
  assertSafeRelativePath(authorization.relativePath);
  if (authorization.operation !== "internal") assertNotProtected(authorization.relativePath);
  const mode = operation.mode ?? 0o644;
  if (authorization.operation === "internal") {
    assertInternalAuthorization(workspaceRoot, authorization);
    if (!authorization.existedAtBind && operation.afterBytes === undefined) {
      throw new ProjectOSError("diff_apply_unsupported", "Absent internal resource requires resulting bytes");
    }
    if (authorization.existedAtBind !== (operation.beforeBytes !== undefined)) {
      throw new ProjectOSError("diff_stale", "Internal resource snapshot is incomplete");
    }
    if (
      authorization.existedAtBind &&
      sha256(operation.beforeBytes!) !== authorization.boundSha256
    ) {
      throw new ProjectOSError("diff_stale", "Internal resource snapshot is stale");
    }
    return {
      authorization,
      targetPath: authorization.targetPath,
      ...(operation.beforeBytes ? { beforeBytes: operation.beforeBytes } : {}),
      ...(operation.afterBytes ? { afterBytes: operation.afterBytes } : {}),
      mode,
      ...(authorization.existedAtBind
        ? {
            backupFile: `${index.toString().padStart(4, "0")}.original`,
            originalSha256: authorization.boundSha256!,
          }
        : {}),
      ...(operation.afterBytes
        ? {
            temporaryPath: siblingTemporaryPath(authorization.targetPath, backupId),
            afterSha256: sha256(operation.afterBytes),
          }
        : {}),
    };
  }
  if (authorization.operation === "create") {
    if (authorization.basename !== basename(authorization.relativePath)) {
      throw new ProjectOSError("diff_scope_violation", "Create authorization basename is invalid");
    }
    if (operation.beforeBytes !== undefined || operation.afterBytes === undefined) {
      throw new ProjectOSError("diff_apply_unsupported", "Create requires after bytes and no before bytes");
    }
    return {
      authorization,
      targetPath: join(authorization.parentCanonicalPath, authorization.basename),
      afterBytes: operation.afterBytes,
      mode,
      temporaryPath: siblingTemporaryPath(
        join(authorization.parentCanonicalPath, authorization.basename),
        backupId,
      ),
      afterSha256: sha256(operation.afterBytes),
    };
  }
  if (operation.beforeBytes === undefined) {
    throw new ProjectOSError("diff_apply_unsupported", `${authorization.operation} requires before bytes`);
  }
  const targetStats = lstatSync(authorization.canonicalPath);
  if (sha256(operation.beforeBytes) !== authorization.boundSha256) {
    throw new ProjectOSError("diff_stale", `Authorized snapshot is stale for '${authorization.relativePath}'`);
  }
  if (authorization.operation === "modify" && operation.afterBytes === undefined) {
    throw new ProjectOSError("diff_apply_unsupported", "Modify requires after bytes");
  }
  if (authorization.operation === "delete" && operation.afterBytes !== undefined) {
    throw new ProjectOSError("diff_apply_unsupported", "Delete must not include after bytes");
  }
  return {
    authorization,
    targetPath: authorization.canonicalPath,
    beforeBytes: operation.beforeBytes,
    ...(operation.afterBytes ? { afterBytes: operation.afterBytes } : {}),
    mode: targetStats.mode & 0o7777,
    backupFile: `${index.toString().padStart(4, "0")}.original`,
    ...(authorization.operation === "modify"
      ? { temporaryPath: siblingTemporaryPath(authorization.canonicalPath, backupId) }
      : {}),
    originalSha256: authorization.boundSha256,
    ...(operation.afterBytes ? { afterSha256: sha256(operation.afterBytes) } : {}),
  };
}

function recoveryAuthorizationStillAddressesTarget(
  workspaceRoot: string,
  authorization: WriteAuthorization,
): boolean {
  try {
    assertSafeRelativePath(authorization.relativePath);
    if (authorization.operation === "internal") {
      assertInternalAuthorization(workspaceRoot, authorization);
      return true;
    }
    assertNotProtected(authorization.relativePath);
    const parentRelative = dirname(authorization.relativePath);
    assertNoSymlinkComponents(workspaceRoot, parentRelative === "." ? "" : parentRelative);
    const parent = resolveContainedPath(workspaceRoot, parentRelative);
    if (authorization.operation === "create") {
      const stats = lstatSync(parent);
      return authorization.basename === basename(authorization.relativePath) &&
        authorization.parentCanonicalPath === parent &&
        authorization.parentDevice === stats.dev &&
        authorization.parentInode === stats.ino;
    }
    return authorization.canonicalPath === resolve(workspaceRoot, authorization.relativePath);
  } catch {
    return false;
  }
}

function buildManifest(
  request: WriteTransactionRequest,
  backupId: string,
  plans: PreparedOperation[],
): ApplyBackupManifestV4 {
  return ApplyBackupManifestV4Schema.parse({
    version: 4,
    backupId,
    runId: request.runId,
    projectId: request.projectId,
    createdAt: new Date().toISOString(),
    restoreAuthority: request.restoreAuthority,
    ...(request.transactionGroup ? { transactionGroup: request.transactionGroup } : {}),
    files: plans.map((plan) => {
      const common = {
        operation: plan.authorization.operation,
        path: plan.authorization.relativePath,
        mode: plan.mode,
      };
      if (plan.authorization.operation === "create") {
        return { ...common, afterSha256: plan.afterSha256 };
      }
      if (plan.authorization.operation === "delete") {
        return {
          ...common,
          backupFile: plan.backupFile,
          originalSha256: plan.originalSha256,
        };
      }
      if (plan.authorization.operation === "internal") {
        return {
          ...common,
          resource: plan.authorization.resource,
          existedBefore: plan.authorization.existedAtBind,
          resultedExists: Boolean(plan.afterBytes),
          ...(plan.backupFile
            ? {
                backupFile: plan.backupFile,
                originalSha256: plan.originalSha256,
              }
            : {}),
          ...(plan.afterSha256 ? { afterSha256: plan.afterSha256 } : {}),
        };
      }
      return {
        ...common,
        backupFile: plan.backupFile,
        originalSha256: plan.originalSha256,
        afterSha256: plan.afterSha256,
      };
    }),
  });
}

function assertOperationUnchanged(workspaceRoot: string, plan: PreparedOperation): void {
  const authorization = plan.authorization;
  try {
    if (authorization.operation === "internal") {
      assertInternalAuthorization(workspaceRoot, authorization);
      const exists = existsSync(authorization.targetPath);
      if (exists !== authorization.existedAtBind) throw new Error("Internal resource presence changed");
      if (exists) {
        const stats = lstatSync(authorization.targetPath);
        if (
          !stats.isFile() ||
          stats.isSymbolicLink() ||
          stats.dev !== authorization.device ||
          stats.ino !== authorization.inode ||
          sha256(readFileSync(authorization.targetPath, { encoding: null })) !== authorization.boundSha256
        ) throw new Error("Internal resource changed");
      }
      return;
    }
    if (authorization.operation === "create") {
      assertNoSymlinkComponents(workspaceRoot, dirname(authorization.relativePath));
      const parent = resolveContainedPath(workspaceRoot, dirname(authorization.relativePath));
      const stats = lstatSync(parent);
      if (
        parent !== authorization.parentCanonicalPath ||
        !stats.isDirectory() ||
        stats.isSymbolicLink() ||
        stats.dev !== authorization.parentDevice ||
        stats.ino !== authorization.parentInode ||
        existsSync(plan.targetPath)
      ) throw new Error("Create target changed");
      return;
    }
    assertNoSymlinkComponents(workspaceRoot, authorization.relativePath);
    const target = resolveContainedPath(workspaceRoot, authorization.relativePath);
    const stats = lstatSync(target);
    if (
      target !== authorization.canonicalPath ||
      !stats.isFile() ||
      stats.isSymbolicLink() ||
      stats.dev !== authorization.device ||
      stats.ino !== authorization.inode ||
      sha256(readFileSync(target, { encoding: null })) !== authorization.boundSha256
    ) throw new Error("Existing target changed");
  } catch (error) {
    throw new ProjectOSError("diff_stale", `Transaction target '${authorization.relativePath}' changed`, {
      cause: error,
    });
  }
}

function commitOperation(primitives: WriteTransactionPrimitives, plan: PreparedOperation): void {
  if (plan.authorization.operation === "create") {
    primitives.createNoClobber(plan.temporaryPath!, plan.targetPath);
  } else if (plan.authorization.operation === "modify") {
    primitives.replace(plan.temporaryPath!, plan.targetPath);
  } else if (plan.authorization.operation === "delete") {
    primitives.remove(plan.targetPath);
  } else if (!plan.afterBytes) {
    primitives.remove(plan.targetPath);
  } else if (plan.authorization.existedAtBind) {
    primitives.replace(plan.temporaryPath!, plan.targetPath);
  } else {
    primitives.createNoClobber(plan.temporaryPath!, plan.targetPath);
  }
  fsyncDirectory(dirname(plan.targetPath));
}

function rollbackPrepared(
  primitives: WriteTransactionPrimitives,
  backupRoot: string,
  plans: PreparedOperation[],
  committed: boolean[],
): string[] {
  const failed: string[] = [];
  for (let index = plans.length - 1; index >= 0; index -= 1) {
    if (!committed[index]) continue;
    const plan = plans[index]!;
    try {
      if (
        plan.authorization.operation === "create" ||
        (plan.authorization.operation === "internal" && !plan.authorization.existedAtBind)
      ) {
        if (!existsSync(plan.targetPath)) continue;
        if (sha256(readFileSync(plan.targetPath, { encoding: null })) !== plan.afterSha256) {
          throw new Error("Created target changed before rollback");
        }
        primitives.remove(plan.targetPath);
        fsyncDirectory(dirname(plan.targetPath));
      } else if (
        plan.authorization.operation === "modify" ||
        (plan.authorization.operation === "internal" && plan.afterSha256 !== undefined)
      ) {
        const currentHash = existsSync(plan.targetPath)
          ? sha256(readFileSync(plan.targetPath, { encoding: null }))
          : undefined;
        if (currentHash === plan.originalSha256) continue;
        if (currentHash !== plan.afterSha256) throw new Error("Modified target changed before rollback");
        restoreOriginal(primitives, plan, backupRoot);
      } else {
        if (existsSync(plan.targetPath)) {
          if (sha256(readFileSync(plan.targetPath, { encoding: null })) === plan.originalSha256) continue;
          throw new Error("Deleted target was recreated before rollback");
        }
        restoreOriginal(primitives, plan, backupRoot);
      }
    } catch {
      failed.push(plan.authorization.relativePath);
    }
  }
  return failed;
}

function restoreOriginal(
  primitives: WriteTransactionPrimitives,
  plan: PreparedOperation,
  backupRoot: string,
): void {
  const temporaryPath = siblingTemporaryPath(plan.targetPath, `${basename(backupRoot)}.rollback`);
  writeExclusiveDurableFile(
    temporaryPath,
    readFileSync(join(backupRoot, plan.backupFile!), { encoding: null }),
    plan.mode,
  );
  try {
    primitives.replace(temporaryPath, plan.targetPath);
    fsyncDirectory(dirname(plan.targetPath));
  } catch (error) {
    removeFileIfPresent(temporaryPath);
    throw error;
  }
}

function inferOperationCommitState(
  plan: PreparedOperation,
): "landed" | "not_landed" | "ambiguous" {
  if (
    plan.authorization.operation === "create" ||
    (plan.authorization.operation === "internal" && !plan.authorization.existedAtBind)
  ) {
    if (!existsSync(plan.targetPath)) return "not_landed";
    return sha256(readFileSync(plan.targetPath, { encoding: null })) === plan.afterSha256
      ? "landed"
      : "ambiguous";
  }
  if (plan.authorization.operation === "delete") {
    if (!existsSync(plan.targetPath)) return "landed";
    return sha256(readFileSync(plan.targetPath, { encoding: null })) === plan.originalSha256
      ? "not_landed"
      : "ambiguous";
  }
  if (plan.authorization.operation === "internal" && plan.afterSha256 === undefined) {
    if (!existsSync(plan.targetPath)) return "landed";
    return sha256(readFileSync(plan.targetPath, { encoding: null })) === plan.originalSha256
      ? "not_landed"
      : "ambiguous";
  }
  if (!existsSync(plan.targetPath)) return "ambiguous";
  const hash = sha256(readFileSync(plan.targetPath, { encoding: null }));
  if (hash === plan.afterSha256) return "landed";
  if (hash === plan.originalSha256) return "not_landed";
  return "ambiguous";
}

function assertDistinctOperations(plans: PreparedOperation[]): void {
  const paths = new Set<string>();
  const identities = new Set<string>();
  for (const plan of plans) {
    const key = resolve(plan.targetPath);
    if (paths.has(key)) {
      throw new ProjectOSError("diff_apply_unsupported", "Transaction contains duplicate targets");
    }
    paths.add(key);
    if (
      plan.authorization.operation !== "create" &&
      !(plan.authorization.operation === "internal" && !plan.authorization.existedAtBind)
    ) {
      const identity = `${plan.authorization.device}:${plan.authorization.inode}`;
      if (identities.has(identity)) {
        throw new ProjectOSError("diff_apply_unsupported", "Transaction contains file-identity aliases");
      }
      identities.add(identity);
    }
  }
}

function assertInternalAuthorization(
  workspaceRoot: string,
  authorization: Extract<WriteAuthorization, { operation: "internal" }>,
): void {
  const expectedPath = resolveInternalResourceRelativePath(
    authorization.resource,
    authorization.relativePath,
  );
  const parentRelativePath = dirname(expectedPath);
  assertNoSymlinkComponents(workspaceRoot, parentRelativePath);
  const expectedParent = resolveContainedPath(workspaceRoot, parentRelativePath);
  const parentStats = lstatSync(expectedParent);
  const expectedTarget = join(expectedParent, basename(expectedPath));
  if (
    authorization.relativePath !== expectedPath ||
    authorization.parentCanonicalPath !== expectedParent ||
    authorization.parentDevice !== parentStats.dev ||
    authorization.parentInode !== parentStats.ino ||
    authorization.targetPath !== expectedTarget
  ) {
    throw new ProjectOSError("diff_scope_violation", "Internal resource authorization is invalid");
  }
}

function resolveInternalResourceRelativePath(
  resource: InternalResourceKind,
  candidate: string | undefined,
): string {
  const fixedPath = INTERNAL_RESOURCE_PATHS[resource];
  if (fixedPath) {
    if (candidate !== undefined && candidate !== fixedPath) {
      throw new ProjectOSError(
        "diff_scope_violation",
        `Internal resource '${resource}' has a fixed path`,
      );
    }
    return fixedPath;
  }
  if (!candidate) {
    throw new ProjectOSError(
      "diff_scope_violation",
      `Internal resource '${resource}' requires an exact relative path`,
    );
  }
  assertSafeRelativePath(candidate);
  const allowed = resource === "design_block_document"
    ? DESIGN_BLOCK_DOCUMENT_PATH
    : resource === "design_block_manifest"
      ? DESIGN_BLOCK_MANIFEST_PATH
      : resource === "design_block_history"
        ? DESIGN_BLOCK_HISTORY_PATH
        : resource === "design_block_snapshot"
          ? DESIGN_BLOCK_SNAPSHOT_PATH
          : resource === "design_block_recovery"
            ? DESIGN_BLOCK_RECOVERY_PATH
            : DESIGN_BLOCK_OWNERSHIP_PATH;
  if (!allowed.test(candidate)) {
    throw new ProjectOSError(
      "diff_scope_violation",
      `Internal resource path '${candidate}' is outside the '${resource}' namespace`,
    );
  }
  return candidate;
}

function assertSafeRelativePath(path: string): void {
  if (
    path.includes("\0") ||
    path.includes("\\") ||
    isAbsolute(path) ||
    path.replace(/\\/gu, "/").split("/").some((part) => part === "..") ||
    path === "." ||
    basename(path).length === 0 ||
    path.endsWith("/")
  ) {
    throw new ProjectOSError("diff_apply_unsupported", `Write path '${path}' is unsafe`);
  }
}

function assertNotProtected(path: string): void {
  const first = path.replace(/\\/gu, "/").split("/").find((part) => part && part !== ".");
  if (first === ".git" || first === ".projectos") {
    throw new ProjectOSError("diff_apply_unsupported", `Write path '${path}' is protected`);
  }
}

function assertNoSymlinkComponents(workspaceRoot: string, relativePath: string): void {
  const lexical = resolve(workspaceRoot, relativePath);
  const rel = relative(workspaceRoot, lexical);
  let current = workspaceRoot;
  for (const component of rel.split(sep).filter(Boolean)) {
    current = join(current, component);
    if (lstatSync(current).isSymbolicLink()) throw new Error("Symlink component denied");
  }
}

function siblingTemporaryPath(targetPath: string, transactionId: string): string {
  return join(
    dirname(targetPath),
    `.${basename(targetPath)}.projectos-${transactionId}-${globalThis.crypto.randomUUID()}.tmp`,
  );
}

function writeExclusiveDurableFile(path: string, contents: Uint8Array, mode: number): void {
  let descriptor: number | undefined;
  try {
    descriptor = openSync(path, "wx", mode);
    writeFileSync(descriptor, contents);
    fchmodSync(descriptor, mode);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    fsyncDirectory(dirname(path));
  } catch (error) {
    if (descriptor !== undefined) {
      try { closeSync(descriptor); } catch { /* preserve original error */ }
    }
    removeFileIfPresent(path);
    throw error;
  }
}

function writeExclusiveDurableJson(path: string, value: unknown): void {
  writeExclusiveDurableFile(
    path,
    new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`),
    0o600,
  );
}

function writeDurableJsonReplacing(path: string, value: unknown): void {
  const temp = `${path}.${globalThis.crypto.randomUUID()}.tmp`;
  writeExclusiveDurableJson(temp, value);
  renameSync(temp, path);
  fsyncDirectory(dirname(path));
}

function updateJournal(
  path: string,
  journal: TransactionJournal,
  patch: Partial<Pick<TransactionJournal, "state">>,
): TransactionJournal {
  const next = TransactionJournalSchema.parse({
    ...journal,
    ...patch,
    updatedAt: new Date().toISOString(),
  });
  writeDurableJsonReplacing(path, next);
  return next;
}

function writeRecoveryManifest(
  backupRoot: string,
  request: Pick<WriteTransactionRequest, "runId" | "projectId"> &
    Partial<Pick<WriteTransactionRequest, "transactionGroup">>,
  backupId: string,
  failedPaths: string[],
): void {
  const path = join(backupRoot, "recovery-manifest.json");
  const payload = {
    version: 2,
    backupId,
    runId: request.runId,
    projectId: request.projectId,
    ...(request.transactionGroup ? { transactionGroup: request.transactionGroup } : {}),
    rollbackFailedPaths: failedPaths,
    createdAt: new Date().toISOString(),
  };
  if (existsSync(path)) writeDurableJsonReplacing(path, payload);
  else writeExclusiveDurableJson(path, payload);
}

function fsyncDirectory(path: string): void {
  let descriptor: number | undefined;
  try {
    descriptor = openSync(path, "r");
    fsyncSync(descriptor);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function removeFileIfPresent(path: string | undefined): void {
  if (!path) return;
  try { unlinkSync(path); } catch (error) {
    if (!isErrno(error, "ENOENT")) throw error;
  }
}

function sweepOrphanedBackupTemps(backupRoot: string): void {
  for (const name of readdirSync(backupRoot)) {
    if (/^(?:manifest|recovery-manifest|transaction-journal)\.json\.[A-Za-z0-9-]+\.tmp$/u.test(name)) {
      removeFileIfPresent(join(backupRoot, name));
    }
  }
}

function sha256(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function pathOf(plan: PreparedOperation): string {
  return plan.authorization.relativePath;
}

function isErrno(error: unknown, code: string): error is Error & { code: string } {
  return error instanceof Error &&
    "code" in error &&
    (error as { code?: unknown }).code === code;
}
