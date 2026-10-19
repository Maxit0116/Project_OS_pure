import { z } from "zod";

import type { HarnessHypothesis } from "../contracts/harness.js";
import type { AgentContextBundle } from "../contracts/local-context.js";
import type { ModelProfile, ThinkingDepth } from "../contracts/settings.js";
import type { DebugLogEntry, DebugSession } from "../contracts/debug-session.js";
import { ModelGateway } from "./model-gateway/index.js";
import { orderedModelOutputSources } from "./model-json-output.js";
import {
  buildInstrumentationSpecs,
  seedManualHypotheses,
} from "./debug-session-service.js";
import type { InstrumentationSpec } from "./debug-instrumentation-service.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const HypothesesPayloadSchema = z.object({
  hypotheses: z
    .array(
      z.object({
        id: z.string().min(1),
        summary: z.string().trim().min(1),
        confidence: z.number().min(0).max(1),
        evidence: z.array(z.string()).default([]),
      }),
    )
    .min(1)
    .max(4),
});

const RootCausePayloadSchema = z.object({
  chosenRootCauseId: z.string().min(1),
  proposedFixSummary: z.string().trim().min(1),
  touchedFiles: z.array(z.string()).default([]),
});

const InstrumentationPayloadSchema = z.object({
  specs: z
    .array(
      z.object({
        id: z.string().min(1),
        filePath: z.string().min(1),
        hypothesisId: z.string().min(1),
        anchor: z.string().min(1),
        kind: z.enum(["fetch_log", "console_log"]),
      }),
    )
    .min(1)
    .max(4),
});

export class DebugHypothesisService {
  constructor(private readonly gateway: ModelGateway) {}

  async generateHypotheses(input: {
    projectId: string;
    bugDescription: string;
    localContext: AgentContextBundle;
    profile: ModelProfile;
    thinkingDepth: ThinkingDepth;
    supplementalMarkdown?: string;
  }): Promise<HarnessHypothesis[]> {
    try {
      const response = await this.gateway.complete(input.profile, {
        projectId: input.projectId,
        requestKind: "root_cause_analysis",
        modelPreference: input.profile.id,
        systemPrompt: `You investigate bugs. Respond with JSON only:
{"hypotheses":[{"id":"hyp_1","summary":"...","confidence":0.0-1.0,"evidence":["..."]}]}
Produce 2-4 concrete, falsifiable hypotheses. No diffs.`,
        input: {
          mode: "debug_hypothesize",
          writeCapability: false,
          bugDescription: input.bugDescription,
          localContext: input.localContext,
          ...(input.supplementalMarkdown?.trim()
            ? { supplementalMarkdown: input.supplementalMarkdown }
            : {}),
        },
        redactionPolicy: "secrets_and_paths",
        maxOutputTokens: 2048,
        thinkingDepth: input.thinkingDepth,
      });
      const parsed = parseJson(response.output, response.reasoning, HypothesesPayloadSchema);
      return parsed.hypotheses.map((item) => ({
        id: item.id,
        summary: item.summary,
        confidence: item.confidence,
        evidence: item.evidence,
      }));
    } catch {
      return seedManualHypotheses(input.bugDescription);
    }
  }

  async proposeInstrumentationSpecs(input: {
    projectId: string;
    session: DebugSession;
    scopeFiles: string[];
    workspaceRoot: string;
    profile: ModelProfile;
    thinkingDepth: ThinkingDepth;
  }): Promise<InstrumentationSpec[]> {
    const fallback = () => buildInstrumentationSpecs(input.session, input.scopeFiles);
    if (input.scopeFiles.length === 0) return fallback();
    try {
      const fileSnippets = input.scopeFiles.slice(0, 3).map((path) => {
        try {
          const content = readFileSync(join(input.workspaceRoot, path), "utf8");
          return { path, preview: content.slice(0, 2_000) };
        } catch {
          return { path, preview: "" };
        }
      });
      const response = await this.gateway.complete(input.profile, {
        projectId: input.projectId,
        requestKind: "root_cause_analysis",
        modelPreference: input.profile.id,
        systemPrompt: `Propose debug instrumentation. Respond with JSON only:
{"specs":[{"id":"inst_1","filePath":"...","hypothesisId":"hyp_…","anchor":"exact substring present in file","kind":"fetch_log"|"console_log"}]}
Anchors MUST appear verbatim in the provided file preview. Paths must be from scopeFiles.`,
        input: {
          mode: "debug_instrument",
          writeCapability: false,
          bugDescription: input.session.bugDescription,
          hypotheses: input.session.hypotheses,
          scopeFiles: input.scopeFiles,
          fileSnippets,
        },
        redactionPolicy: "secrets_and_paths",
        maxOutputTokens: 1024,
        thinkingDepth: input.thinkingDepth,
      });
      const parsed = parseJson(response.output, response.reasoning, InstrumentationPayloadSchema);
      const allowed = new Set(input.scopeFiles);
      const contentByPath = new Map(
        fileSnippets.map((item) => [item.path, item.preview] as const),
      );
      const validated = parsed.specs.filter((spec) => {
        if (!allowed.has(spec.filePath)) return false;
        const preview = contentByPath.get(spec.filePath) ?? "";
        return preview.includes(spec.anchor);
      });
      return validated.length > 0 ? validated : fallback();
    } catch {
      return fallback();
    }
  }

  async chooseRootCauseFromLogs(input: {
    projectId: string;
    session: DebugSession;
    logs: DebugLogEntry[];
    profile: ModelProfile;
    thinkingDepth: ThinkingDepth;
  }): Promise<{
    chosenRootCauseId: string;
    proposedFix: NonNullable<DebugSession["proposedFix"]>;
  }> {
    const fallbackId = input.session.hypotheses[0]?.id ?? "hyp_manual_1";
    try {
      const response = await this.gateway.complete(input.profile, {
        projectId: input.projectId,
        requestKind: "root_cause_analysis",
        modelPreference: input.profile.id,
        systemPrompt: `You analyze debug logs. Respond with JSON only:
{"chosenRootCauseId":"hyp_…","proposedFixSummary":"...","touchedFiles":["path"]}
Choose among the provided hypothesis ids. Keep the fix summary short.`,
        input: {
          mode: "debug_analyze",
          writeCapability: false,
          bugDescription: input.session.bugDescription,
          hypotheses: input.session.hypotheses,
          logs: input.logs.slice(0, 40),
        },
        redactionPolicy: "secrets_and_paths",
        maxOutputTokens: 1024,
        thinkingDepth: input.thinkingDepth,
      });
      const parsed = parseJson(response.output, response.reasoning, RootCausePayloadSchema);
      const chosen =
        input.session.hypotheses.find((item) => item.id === parsed.chosenRootCauseId)?.id ??
        fallbackId;
      return {
        chosenRootCauseId: chosen,
        proposedFix: {
          summary: parsed.proposedFixSummary,
          touchedFiles: parsed.touchedFiles,
          patchKind: "root_cause",
        },
      };
    } catch {
      const active =
        input.session.hypotheses.find((item) => !item.rejected) ?? input.session.hypotheses[0];
      return {
        chosenRootCauseId: active?.id ?? fallbackId,
        proposedFix: {
          summary: active?.summary ?? input.session.bugDescription,
          touchedFiles: input.session.instrumentation.map((item) => item.filePath),
          patchKind: "root_cause",
        },
      };
    }
  }
}

function parseJson<T>(
  output: string,
  reasoning: string | undefined,
  schema: z.ZodType<T>,
): T {
  for (const source of orderedModelOutputSources(output, reasoning)) {
    try {
      const start = source.indexOf("{");
      const end = source.lastIndexOf("}");
      if (start < 0 || end <= start) continue;
      return schema.parse(JSON.parse(source.slice(start, end + 1)));
    } catch {
      /* try next */
    }
  }
  throw new Error("Could not parse debug hypothesis JSON");
}
