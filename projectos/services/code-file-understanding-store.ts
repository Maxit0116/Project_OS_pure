import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  CodeFileUnderstandingDocumentSchema,
  emptyCodeFileUnderstandingDocument,
  type CodeFileUnderstandingDocument,
  type CodeFileUnderstandingEntry,
} from "../contracts/code-file-understanding.js";
import { ProjectOSError } from "../errors.js";

const RELATIVE_PATH = join(".projectos", "code-file-understanding.json");

export function readCodeFileUnderstandingDocument(
  workspaceRoot: string,
  projectId: string,
): CodeFileUnderstandingDocument {
  const fullPath = join(workspaceRoot, RELATIVE_PATH);
  if (!existsSync(fullPath)) {
    return emptyCodeFileUnderstandingDocument(projectId);
  }
  try {
    const parsed = CodeFileUnderstandingDocumentSchema.parse(
      JSON.parse(readFileSync(fullPath, "utf8")),
    );
    if (parsed.projectId !== projectId) {
      throw new ProjectOSError(
        "persistence_write_failed",
        "Code-file understanding belongs to a different project",
      );
    }
    return parsed;
  } catch (error) {
    if (error instanceof ProjectOSError) throw error;
    return emptyCodeFileUnderstandingDocument(projectId);
  }
}

export function writeCodeFileUnderstandingDocument(
  workspaceRoot: string,
  document: CodeFileUnderstandingDocument,
): CodeFileUnderstandingDocument {
  const parsed = CodeFileUnderstandingDocumentSchema.parse(document);
  const projectOsRoot = join(workspaceRoot, ".projectos");
  mkdirSync(projectOsRoot, { recursive: true });
  const fullPath = join(workspaceRoot, RELATIVE_PATH);
  writeFileSync(fullPath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
  return parsed;
}

export function findCodeFileUnderstandingEntry(
  document: CodeFileUnderstandingDocument,
  path: string,
): CodeFileUnderstandingEntry | undefined {
  return document.entries.find((entry) => entry.path === path);
}

export function upsertCodeFileUnderstandingEntry(
  document: CodeFileUnderstandingDocument,
  entry: CodeFileUnderstandingEntry,
): CodeFileUnderstandingDocument {
  const others = document.entries.filter((item) => item.path !== entry.path);
  return {
    ...document,
    entries: [entry, ...others],
  };
}
