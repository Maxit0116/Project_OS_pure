import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import {
  FirstPrinciplesSessionSchema,
  ThesisIndexSchema,
  emptyThesisIndex,
  type FirstPrinciplesSession,
  type ThesisIndex,
} from "../../contracts/first-principles.js";
import { thesisDir, thesisIndexPath, thesisSessionPath } from "./paths.js";

export function readThesisIndex(workspaceRoot: string): ThesisIndex {
  const path = thesisIndexPath(workspaceRoot);
  if (!existsSync(path)) return emptyThesisIndex();
  try {
    return ThesisIndexSchema.parse(JSON.parse(readFileSync(path, "utf8")));
  } catch {
    return emptyThesisIndex();
  }
}

function writeThesisIndex(workspaceRoot: string, index: ThesisIndex): ThesisIndex {
  const normalized = ThesisIndexSchema.parse(index);
  mkdirSync(thesisDir(workspaceRoot), { recursive: true });
  writeFileSync(
    thesisIndexPath(workspaceRoot),
    `${JSON.stringify(normalized, null, 2)}\n`,
    "utf8",
  );
  return normalized;
}

export function readThesisSession(
  workspaceRoot: string,
  id: string,
): FirstPrinciplesSession | null {
  const path = thesisSessionPath(workspaceRoot, id);
  if (!existsSync(path)) return null;
  try {
    return FirstPrinciplesSessionSchema.parse(
      JSON.parse(readFileSync(path, "utf8")),
    );
  } catch {
    return null;
  }
}

export function writeThesisSession(
  workspaceRoot: string,
  session: FirstPrinciplesSession,
): FirstPrinciplesSession {
  const normalized = FirstPrinciplesSessionSchema.parse({
    ...session,
    updatedAt: new Date().toISOString(),
  });
  mkdirSync(thesisDir(workspaceRoot), { recursive: true });
  writeFileSync(
    thesisSessionPath(workspaceRoot, normalized.id),
    `${JSON.stringify(normalized, null, 2)}\n`,
    "utf8",
  );

  if (normalized.status === "concluded" && normalized.thesis) {
    const index = readThesisIndex(workspaceRoot);
    const entry = {
      id: normalized.id,
      title: normalized.thesis.title,
      verdict: normalized.thesis.verdict,
      updatedAt: normalized.updatedAt,
      ...(normalized.chatSessionId
        ? { chatSessionId: normalized.chatSessionId }
        : {}),
    };
    const entries = [
      entry,
      ...index.entries.filter((item) => item.id !== normalized.id),
    ].slice(0, 200);
    writeThesisIndex(workspaceRoot, { version: 1, entries });
  }

  return normalized;
}

export function listThesisSessions(workspaceRoot: string): ThesisIndex {
  const index = readThesisIndex(workspaceRoot);
  if (index.entries.length > 0) return index;
  // Recover index from files if missing
  const dir = thesisDir(workspaceRoot);
  if (!existsSync(dir)) return emptyThesisIndex();
  const entries = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".json") || name === "index.json") continue;
    const session = readThesisSession(workspaceRoot, name.replace(/\.json$/u, ""));
    if (!session?.thesis || session.status !== "concluded") continue;
    entries.push({
      id: session.id,
      title: session.thesis.title,
      verdict: session.thesis.verdict,
      updatedAt: session.updatedAt,
      ...(session.chatSessionId ? { chatSessionId: session.chatSessionId } : {}),
    });
  }
  return writeThesisIndex(workspaceRoot, { version: 1, entries });
}
