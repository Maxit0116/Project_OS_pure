import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import {
  FILE_TIMELINE_MAX_ENTRIES_PER_FILE,
  FileTimelineEntrySchema,
  FileTimelineIndexSchema,
  type FileTimelineEntry,
  type FileTimelineEntryKind,
  type FileTimelineIndex,
  type FileTimelineSnapshotContent,
  type SaveFileWithHistoryResult,
} from "../contracts/file-timeline.js";
import { ApplyBackupManifestV3Schema } from "../contracts/write-transaction.js";
import { resolveContainedPath } from "../utils/path-containment.js";

const FILE_TIMELINE_PATH = join(".projectos", "file-timeline.json");
const MANUAL_SNAPSHOTS_DIR = join(".projectos", "manual-snapshots");
const PROPOSED_SNAPSHOTS_DIR = join(".projectos", "proposed-snapshots");

function sha256Text(content: string): string {
  return `sha256:${createHash("sha256").update(content, "utf8").digest("hex")}`;
}

function readTimelineIndex(workspaceRoot: string): FileTimelineIndex {
  const indexPath = join(workspaceRoot, FILE_TIMELINE_PATH);
  if (!existsSync(indexPath)) {
    return { version: "0.1.0", entries: [] };
  }
  try {
    return FileTimelineIndexSchema.parse(JSON.parse(readFileSync(indexPath, "utf8")));
  } catch {
    return { version: "0.1.0", entries: [] };
  }
}

function writeTimelineIndex(workspaceRoot: string, index: FileTimelineIndex): void {
  const indexPath = join(workspaceRoot, FILE_TIMELINE_PATH);
  mkdirSync(join(workspaceRoot, ".projectos"), { recursive: true });
  writeFileSync(indexPath, JSON.stringify(index, null, 2), "utf8");
}

function pruneEntriesForFile(
  workspaceRoot: string,
  entries: FileTimelineEntry[],
  filePath: string,
): FileTimelineEntry[] {
  const fileEntries = entries.filter((entry) => entry.filePath === filePath);
  const otherEntries = entries.filter((entry) => entry.filePath !== filePath);
  if (fileEntries.length <= FILE_TIMELINE_MAX_ENTRIES_PER_FILE) {
    return entries;
  }
  const kept = fileEntries
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, FILE_TIMELINE_MAX_ENTRIES_PER_FILE);
  const removed = fileEntries.filter((entry) => !kept.includes(entry));
  for (const entry of removed) {
    removeSnapshot(workspaceRoot, entry);
  }
  return [...otherEntries, ...kept];
}

function removeSnapshot(workspaceRoot: string, entry: FileTimelineEntry): void {
  if (!entry.snapshot?.snapshotId) return;
  const snapshotId = entry.snapshot.snapshotId;
  if (entry.kind === "agent_proposed") {
    const dir = join(workspaceRoot, PROPOSED_SNAPSHOTS_DIR, snapshotId);
    if (!existsSync(dir)) return;
    for (const file of readdirSync(dir)) {
      unlinkSync(join(dir, file));
    }
    return;
  }
  if (entry.kind === "manual_save") {
    const dir = join(workspaceRoot, MANUAL_SNAPSHOTS_DIR, snapshotId);
    if (!existsSync(dir)) return;
    for (const file of readdirSync(dir)) {
      unlinkSync(join(dir, file));
    }
  }
}

function writeSnapshotPair(
  workspaceRoot: string,
  baseDir: string,
  snapshotId: string,
  before: string | undefined,
  after: string | undefined,
): void {
  const dir = join(workspaceRoot, baseDir, snapshotId);
  mkdirSync(dir, { recursive: true });
  if (before !== undefined) {
    writeFileSync(join(dir, "before.txt"), before, "utf8");
  }
  if (after !== undefined) {
    writeFileSync(join(dir, "after.txt"), after, "utf8");
  }
}

function readSnapshotPair(
  workspaceRoot: string,
  baseDir: string,
  snapshotId: string,
): FileTimelineSnapshotContent {
  const dir = join(workspaceRoot, baseDir, snapshotId);
  const content: FileTimelineSnapshotContent = {};
  const beforePath = join(dir, "before.txt");
  const afterPath = join(dir, "after.txt");
  if (existsSync(beforePath)) {
    content.before = readFileSync(beforePath, "utf8");
  }
  if (existsSync(afterPath)) {
    content.after = readFileSync(afterPath, "utf8");
  }
  return content;
}

function appendEntry(workspaceRoot: string, entry: FileTimelineEntry): FileTimelineEntry {
  const index = readTimelineIndex(workspaceRoot);
  const parsed = FileTimelineEntrySchema.parse(entry);
  const nextEntries = pruneEntriesForFile(workspaceRoot, [...index.entries, parsed], parsed.filePath);
  writeTimelineIndex(workspaceRoot, { version: "0.1.0", entries: nextEntries });
  return parsed;
}

export function listFileTimeline(workspaceRoot: string, filePath: string): FileTimelineEntry[] {
  const index = readTimelineIndex(workspaceRoot);
  return index.entries
    .filter((entry) => entry.filePath === filePath)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

export function getFileTimelineEntry(
  workspaceRoot: string,
  entryId: string,
): FileTimelineEntry | null {
  const index = readTimelineIndex(workspaceRoot);
  return index.entries.find((entry) => entry.id === entryId) ?? null;
}

export function getFileTimelineSnapshot(
  workspaceRoot: string,
  entry: FileTimelineEntry,
): FileTimelineSnapshotContent {
  if (entry.kind === "agent_applied" || entry.kind === "agent_reverted") {
    if (!entry.backupId) return {};
    const manifestPath = join(
      workspaceRoot,
      ".projectos",
      "apply-backups",
      entry.backupId,
      "manifest.json",
    );
    if (!existsSync(manifestPath)) return {};
    const manifest = ApplyBackupManifestV3Schema.parse(JSON.parse(readFileSync(manifestPath, "utf8")));
    const fileEntry = manifest.files.find((file) => file.path === entry.filePath);
    if (!fileEntry) return {};
    const backupRoot = join(workspaceRoot, ".projectos", "apply-backups", entry.backupId);
    const content: FileTimelineSnapshotContent = {};
    if (fileEntry.operation === "modify" || fileEntry.operation === "delete") {
      if ("backupFile" in fileEntry && fileEntry.backupFile) {
        content.before = readFileSync(join(backupRoot, fileEntry.backupFile), "utf8");
      }
    }
    if (fileEntry.operation === "create" || fileEntry.operation === "modify") {
      try {
        content.after = readFileSync(resolveContainedPath(workspaceRoot, entry.filePath), "utf8");
      } catch {
        // file may have been deleted
      }
    }
    return content;
  }

  if (entry.kind === "agent_proposed" && entry.snapshot?.snapshotId) {
    return readSnapshotPair(workspaceRoot, PROPOSED_SNAPSHOTS_DIR, entry.snapshot.snapshotId);
  }

  if (entry.kind === "manual_save" && entry.snapshot?.snapshotId) {
    return readSnapshotPair(workspaceRoot, MANUAL_SNAPSHOTS_DIR, entry.snapshot.snapshotId);
  }

  return {};
}

export interface AppendProposedTimelineInput {
  filePath: string;
  runId: string;
  before?: string;
  after?: string;
  label?: string;
}

export function appendProposedTimelineEntry(
  workspaceRoot: string,
  input: AppendProposedTimelineInput,
): FileTimelineEntry {
  const snapshotId = randomUUID();
  writeSnapshotPair(
    workspaceRoot,
    PROPOSED_SNAPSHOTS_DIR,
    snapshotId,
    input.before,
    input.after,
  );
  return appendEntry(workspaceRoot, {
    id: randomUUID(),
    filePath: input.filePath,
    timestamp: new Date().toISOString(),
    kind: "agent_proposed",
    runId: input.runId,
    label: input.label ?? "Agent proposed",
    beforeSha256: input.before !== undefined ? sha256Text(input.before) : undefined,
    afterSha256: input.after !== undefined ? sha256Text(input.after) : undefined,
    snapshot: { snapshotId },
  });
}

export interface AppendAgentAppliedTimelineInput {
  filePath: string;
  runId: string;
  backupId: string;
  label?: string;
}

export function appendAgentAppliedTimelineEntry(
  workspaceRoot: string,
  input: AppendAgentAppliedTimelineInput,
): FileTimelineEntry {
  return appendEntry(workspaceRoot, {
    id: randomUUID(),
    filePath: input.filePath,
    timestamp: new Date().toISOString(),
    kind: "agent_applied",
    runId: input.runId,
    backupId: input.backupId,
    label: input.label ?? "Agent applied",
    snapshot: { snapshotId: input.backupId, backupId: input.backupId },
  });
}

export interface AppendAgentRevertedTimelineInput {
  filePath: string;
  runId?: string;
  backupId: string;
  label?: string;
}

export function appendAgentRevertedTimelineEntry(
  workspaceRoot: string,
  input: AppendAgentRevertedTimelineInput,
): FileTimelineEntry {
  return appendEntry(workspaceRoot, {
    id: randomUUID(),
    filePath: input.filePath,
    timestamp: new Date().toISOString(),
    kind: "agent_reverted",
    runId: input.runId,
    backupId: input.backupId,
    label: input.label ?? "Agent reverted",
    snapshot: { snapshotId: input.backupId, backupId: input.backupId },
  });
}

export function saveFileWithHistory(
  workspaceRoot: string,
  filePath: string,
  content: string,
): SaveFileWithHistoryResult {
  const fullPath = resolveContainedPath(workspaceRoot, filePath);
  let before: string | undefined;
  const existed = existsSync(fullPath);
  if (existed) {
    before = readFileSync(fullPath, "utf8");
  }
  writeFileSync(fullPath, content, "utf8");
  const snapshotId = randomUUID();
  writeSnapshotPair(workspaceRoot, MANUAL_SNAPSHOTS_DIR, snapshotId, before, content);
  const entry = appendEntry(workspaceRoot, {
    id: randomUUID(),
    filePath,
    timestamp: new Date().toISOString(),
    kind: "manual_save",
    label: "Manual save",
    beforeSha256: before !== undefined ? sha256Text(before) : undefined,
    afterSha256: sha256Text(content),
    snapshot: { snapshotId },
  });
  return { entry, created: !existed };
}

export function appendTimelineEntriesForBackup(
  workspaceRoot: string,
  backupId: string,
  runId: string,
  kind: Extract<FileTimelineEntryKind, "agent_applied" | "agent_reverted">,
  filePaths: string[],
): FileTimelineEntry[] {
  const label = kind === "agent_applied" ? "Agent applied" : "Agent reverted";
  return filePaths.map((filePath) =>
    appendEntry(workspaceRoot, {
      id: randomUUID(),
      filePath,
      timestamp: new Date().toISOString(),
      kind,
      runId,
      backupId,
      label,
      snapshot: { snapshotId: backupId, backupId },
    }),
  );
}
