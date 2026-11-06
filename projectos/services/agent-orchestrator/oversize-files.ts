import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { ProjectOSError } from "../../errors.js";
import { SELECTED_FILE_MAX_ESTIMATED_TOKENS } from "../local-context-assembler.js";

/**
 * Files an edit cannot be planned on: an edit sends the whole file to the model, so one above the
 * limit fails when its turn comes, after the plan was made and the other files were done, and takes
 * the whole request with it (observed on excalidraw: a 93,000-token App.tsx was planned as one of
 * two tasks, and the task that was fine was thrown away with it).
 */
export interface OversizeFile {
  path: string;
  estimatedTokens: number;
}

/** The size estimate the context assembler uses: about four characters to a token. */
function estimatedTokens(text: string): number {
  return Math.ceil([...text].length / 4);
}

/** Tokens of a file above the edit limit, or undefined when it fits (or cannot be read). */
export function oversizeFileTokens(workspaceRoot: string, relativePath: string): number | undefined {
  try {
    const absolute = join(workspaceRoot, relativePath);
    const bytes = statSync(absolute).size;
    // Bytes are never fewer than characters, so a file that fits by bytes fits by characters.
    if (Math.ceil(bytes / 4) <= SELECTED_FILE_MAX_ESTIMATED_TOKENS) return undefined;
    const tokens = estimatedTokens(readFileSync(absolute, "utf8"));
    return tokens > SELECTED_FILE_MAX_ESTIMATED_TOKENS ? tokens : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The paths a planner may choose from, without the ones that cannot be edited. Throws the same error
 * the context assembler would, so the person sees one explanation, when nothing editable is left.
 */
export function editableCandidates(
  workspaceRoot: string,
  paths: readonly string[],
): { editable: string[]; tooLarge: OversizeFile[] } {
  const editable: string[] = [];
  const tooLarge: OversizeFile[] = [];
  for (const path of paths) {
    const tokens = oversizeFileTokens(workspaceRoot, path);
    if (tokens === undefined) editable.push(path);
    else tooLarge.push({ path, estimatedTokens: tokens });
  }
  if (editable.length === 0 && tooLarge.length > 0) {
    const first = tooLarge[0]!;
    throw new ProjectOSError(
      "local_context_unavailable",
      `Selected file '${first.path}' cannot be used for local context: selected_file_too_large (about ${first.estimatedTokens} tokens; the limit is ${SELECTED_FILE_MAX_ESTIMATED_TOKENS})`,
    );
  }
  return { editable, tooLarge };
}

/** One sentence for the planner's prompt, or nothing when no file was left out. */
export function oversizeNote(tooLarge: readonly OversizeFile[] | undefined): string {
  if (!tooLarge || tooLarge.length === 0) return "";
  const listed = tooLarge.slice(0, 8).map((file) => `${file.path} (about ${file.estimatedTokens} tokens)`).join(", ");
  return `These files of this scope are too large to be edited (over ${SELECTED_FILE_MAX_ESTIMATED_TOKENS} tokens) and are not in the list: ${listed}. Choose other files that can carry the change; if the change genuinely needs one of them, return the tasks that can be done and say so in the rationale.`;
}
