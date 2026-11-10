/**
 * PW-7: Issue / PR / selected code / error context → same run materials path.
 * Offline contract — does not call live GitHub; builds TaskMaterial snapshots.
 */
import type { LoopTaskMaterial } from "../contracts/loop-task-materials.js";

export type LoopPw7ContextKind =
  | "issue"
  | "pull_request"
  | "code_selection"
  | "error_context";

export type LoopPw7ContextInput = {
  kind: LoopPw7ContextKind;
  title: string;
  body?: string;
  /** repo#number or path:line range — opaque ref, not a secret. */
  ref?: string;
  bindingNodeIds?: string[];
};

export function buildPw7ContextMaterial(
  input: LoopPw7ContextInput,
  now = new Date().toISOString(),
): LoopTaskMaterial {
  const purpose =
    input.kind === "issue" || input.kind === "pull_request"
      ? "issue_or_pr"
      : input.kind === "code_selection"
        ? "code_context"
        : "error_screenshot";
  const body = (input.body ?? "").trim();
  return {
    id: `mat_pw7_${input.kind}_${Date.now().toString(36)}`,
    kind: input.kind === "code_selection" ? "project_ref" : "text",
    purpose,
    title: input.title.slice(0, 240) || input.kind,
    source: input.kind === "code_selection" ? "project_ref" : "paste",
    parseStatus: "ok",
    parseLevel: "text_preview",
    parseMessage: `PW-7 ${input.kind} context → task material (same run path; not authoring)`,
    textPreview: body.slice(0, 8_000) || undefined,
    ...(input.ref && input.kind === "code_selection"
      ? {
          projectRef: {
            path: input.ref.slice(0, 500),
            kind: "file" as const,
          },
        }
      : {}),
    ...(input.ref && input.kind !== "code_selection"
      ? { contentRef: `pw7://${input.kind}/${input.ref.slice(0, 400)}` }
      : {}),
    ...(input.bindingNodeIds?.length
      ? { bindingNodeIds: input.bindingNodeIds.slice(0, 32) }
      : {}),
    runOverride: true,
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
}
