import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReminderDocRewrite, ReminderTimelineItem } from "../../contracts/reminder-graph.js";
import type { ModelGatewayRequest } from "../../contracts/model-gateway.js";
import type { ModelProfile } from "../../contracts/settings.js";
import type { ModelGateway } from "../model-gateway/gateway.js";
import {
  cleanLlmRewriteOutput,
  evaluateLlmRewrite,
  rewriteFromEvaluation,
} from "./llm-rewrite-eval.js";

export type ReminderRewriteGateway = Pick<ModelGateway, "complete">;

/**
 * Heuristic fallback: annotate the source excerpt or append a dated note.
 */
export function heuristicDocRewrites(
  workspaceRoot: string,
  item: ReminderTimelineItem,
  reason: string,
): ReminderDocRewrite[] {
  const rewrites: ReminderDocRewrite[] = [];
  for (const ref of item.sourceRefs ?? []) {
    const abs = join(workspaceRoot, ref.path);
    if (!existsSync(abs)) continue;
    let before: string;
    try {
      before = readFileSync(abs, "utf8");
    } catch {
      continue;
    }
    if (ref.excerpt && before.includes(ref.excerpt)) {
      const replacement = `${ref.excerpt} 〔已按 Reminder Graph 调整：${reason}〕`;
      rewrites.push({
        path: ref.path,
        before,
        after: before.replace(ref.excerpt, replacement),
      });
      continue;
    }
    const marker = `\n\n<!-- reminder-graph:${item.id} -->\n`;
    const note = `> Reminder Graph update (${new Date().toISOString().slice(0, 10)}): ${reason}\n`;
    if (before.includes(`reminder-graph:${item.id}`)) continue;
    rewrites.push({
      path: ref.path,
      before,
      after: `${before.trimEnd()}${marker}${note}\n`,
    });
  }
  return rewrites;
}

/**
 * Ask the model to rewrite doc sections for a timeline change.
 * Falls back to heuristicDocRewrites when gateway/profile missing or model fails.
 */
export async function buildDocRewrites(args: {
  workspaceRoot: string;
  item: ReminderTimelineItem;
  reason: string;
  gateway?: ReminderRewriteGateway | null;
  profile?: ModelProfile | null;
}): Promise<ReminderDocRewrite[]> {
  const fallback = () =>
    heuristicDocRewrites(args.workspaceRoot, args.item, args.reason);

  if (!args.gateway || !args.profile) return fallback();

  const refs = args.item.sourceRefs ?? [];
  if (refs.length === 0) return fallback();

  const rewrites: ReminderDocRewrite[] = [];
  for (const ref of refs.slice(0, 3)) {
    const abs = join(args.workspaceRoot, ref.path);
    if (!existsSync(abs)) continue;
    let before: string;
    try {
      before = readFileSync(abs, "utf8");
    } catch {
      continue;
    }
    const excerpt = ref.excerpt ?? before.slice(0, 800);
    const request: ModelGatewayRequest = {
      requestKind: "context_summary",
      redactionPolicy: "secrets_and_paths",
      maxOutputTokens: 8_000,
      systemPrompt:
        "You update project planning docs for Reminder Graph. " +
        "Return ONLY the full revised file contents. Preserve structure and headings. " +
        "Adjust the deferred/phase wording so it matches the new timeline commitment. " +
        "Do not wrap the whole file in markdown fences.",
      input: {
        reason: args.reason,
        itemTitle: args.item.title,
        path: ref.path,
        excerpt,
        file: before.slice(0, 24_000),
        instruction:
          "Rewrite the file so the planning language matches the Reminder Graph change.",
      },
    };
    try {
      const response = await args.gateway.complete(args.profile, request);
      const after = cleanLlmRewriteOutput(response.output ?? "");
      const evaluation = evaluateLlmRewrite({
        before,
        after,
        reason: args.reason,
        excerpt: ref.excerpt,
      });
      const accepted = rewriteFromEvaluation({
        path: ref.path,
        before,
        evaluation,
      });
      if (accepted) {
        rewrites.push(accepted);
        continue;
      }
      rewrites.push(
        ...heuristicDocRewrites(args.workspaceRoot, args.item, args.reason).filter(
          (entry) => entry.path === ref.path,
        ),
      );
    } catch {
      rewrites.push(
        ...heuristicDocRewrites(args.workspaceRoot, args.item, args.reason).filter(
          (entry) => entry.path === ref.path,
        ),
      );
    }
  }

  if (rewrites.length === 0) return fallback();
  const byPath = new Map<string, ReminderDocRewrite>();
  for (const rewrite of rewrites) byPath.set(rewrite.path, rewrite);
  return [...byPath.values()];
}
