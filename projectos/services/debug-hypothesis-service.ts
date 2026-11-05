import { z } from "zod";

import type { HarnessHypothesis } from "../contracts/harness.js";
import type { AgentContextBundle } from "../contracts/local-context.js";
import type { ModelProfile, ThinkingDepth } from "../contracts/settings.js";
import type { DebugLogEntry, DebugSession } from "../contracts/debug-session.js";
import type { ModelToolDefinition } from "../contracts/model-gateway.js";
import { ModelGateway } from "./model-gateway/index.js";
import { runStructuredStep, StructuredIssues } from "./structured-step.js";
import {
  buildInstrumentationSpecs,
  seedManualHypotheses,
} from "./debug-session-service.js";
import { instrumentationInsertionOffset, type InstrumentationSpec } from "./debug-instrumentation-service.js";
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

// A reasoning model thinks inside the output budget. 2048 (then 1024) cut the hypotheses off
// mid-string live, the JSON failed to parse, and a person was shown placeholder hypotheses
// ("Inspect code paths related to: <the bug text>") in place of the model's own, which had been
// written but not finished. Each step now has room, a retry with more, and exact feedback.
const DEBUG_STEP_MAX_OUTPUT_TOKENS = 8192;
const DEBUG_STEP_RETRY_MAX_OUTPUT_TOKENS = 16_384;

const tool = (name: string, description: string, parameters: Record<string, unknown>): ModelToolDefinition => ({
  type: "function",
  function: { name, description, parameters },
});

const HYPOTHESES_TOOL = tool("submit_hypotheses", "Submit 2-4 concrete, falsifiable hypotheses about the cause of the bug.", {
  type: "object",
  properties: {
    hypotheses: {
      type: "array",
      minItems: 1,
      maxItems: 4,
      items: {
        type: "object",
        properties: {
          id: { type: "string", description: "hyp_1, hyp_2, ..." },
          summary: { type: "string" },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          evidence: { type: "array", items: { type: "string" } },
        },
        required: ["id", "summary", "confidence"],
      },
    },
  },
  required: ["hypotheses"],
});

const INSTRUMENTATION_TOOL = tool("submit_instrumentation", "Propose where to add debug logging. Anchors must appear verbatim in the provided file preview.", {
  type: "object",
  properties: {
    specs: {
      type: "array",
      minItems: 1,
      maxItems: 4,
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          filePath: { type: "string", description: "One of scopeFiles" },
          hypothesisId: { type: "string" },
          anchor: { type: "string", description: "An exact substring of the file preview" },
          kind: { enum: ["fetch_log", "console_log"] },
        },
        required: ["id", "filePath", "hypothesisId", "anchor", "kind"],
      },
    },
  },
  required: ["specs"],
});

const ROOT_CAUSE_TOOL = tool("submit_root_cause", "Choose the most likely root cause among the supplied hypotheses and say, briefly, how to fix it.", {
  type: "object",
  properties: {
    chosenRootCauseId: { type: "string", description: "One of the supplied hypothesis ids" },
    proposedFixSummary: { type: "string" },
    touchedFiles: {
      type: "array",
      items: { type: "string" },
      description: "Repo-relative paths of the files that must change, exactly as they appear in the evidence",
    },
  },
  required: ["chosenRootCauseId", "proposedFixSummary", "touchedFiles"],
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
      const { value } = await runStructuredStep(
        (request) => this.gateway.complete(input.profile, request),
        {
          projectId: input.projectId,
          requestKind: "root_cause_analysis",
          modelPreference: input.profile.id,
          systemPrompt: `You investigate bugs. Answer by calling submit_hypotheses. If tools are unavailable, respond with JSON only:
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
          thinkingDepth: input.thinkingDepth,
        },
        {
          step: "debug_hypotheses",
          tools: [HYPOTHESES_TOOL],
          maxOutputTokens: DEBUG_STEP_MAX_OUTPUT_TOKENS,
          retryMaxOutputTokens: DEBUG_STEP_RETRY_MAX_OUTPUT_TOKENS,
          accept: ({ value: answer }) => HypothesesPayloadSchema.parse(answer),
        },
      );
      return value.hypotheses.map((item) => ({
        id: item.id,
        summary: item.summary,
        confidence: item.confidence,
        evidence: item.evidence,
      }));
    } catch (error) {
      console.warn("[projectos] debug hypotheses fell back to placeholders", error instanceof Error ? error.message : error);
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
      const allowed = new Set(input.scopeFiles);
      const contentByPath = new Map(
        fileSnippets.map((item) => [item.path, item.preview] as const),
      );
      const { value } = await runStructuredStep(
        (request) => this.gateway.complete(input.profile, request),
        {
          projectId: input.projectId,
          requestKind: "root_cause_analysis",
          modelPreference: input.profile.id,
          systemPrompt: `Propose debug instrumentation. Answer by calling submit_instrumentation. If tools are unavailable, respond with JSON only:
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
          thinkingDepth: input.thinkingDepth,
        },
        {
          step: "debug_instrumentation",
          tools: [INSTRUMENTATION_TOOL],
          maxOutputTokens: DEBUG_STEP_MAX_OUTPUT_TOKENS,
          retryMaxOutputTokens: DEBUG_STEP_RETRY_MAX_OUTPUT_TOKENS,
          accept: ({ value: answer }) => {
            const payload = InstrumentationPayloadSchema.parse(answer);
            // Name each spec that cannot be used, so the model can fix that one.
            const problems = payload.specs.flatMap((spec, index) => {
              if (!allowed.has(spec.filePath)) return [`specs.${index}.filePath: '${spec.filePath}' is not one of scopeFiles`];
              if (!(contentByPath.get(spec.filePath) ?? "").includes(spec.anchor)) {
                return [`specs.${index}.anchor: not found verbatim in the preview of ${spec.filePath}`];
              }
              try {
                const full = readFileSync(join(input.workspaceRoot, spec.filePath), "utf8");
                if (instrumentationInsertionOffset(full, spec.anchor, spec.filePath) === undefined) {
                  return [`specs.${index}.anchor: is not inside a statement a probe can be placed before; choose a line of code, not a comment or a type`];
                }
              } catch {
                /* an unreadable file is reported when the probes are applied */
              }
              return [];
            });
            if (problems.length > 0) throw new StructuredIssues(problems);
            return payload;
          },
        },
      );
      const validated = value.specs;
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
      const { value: parsed } = await runStructuredStep(
        (request) => this.gateway.complete(input.profile, request),
        {
          projectId: input.projectId,
          requestKind: "root_cause_analysis",
          modelPreference: input.profile.id,
          systemPrompt: `You analyze debug logs. Answer by calling submit_root_cause. If tools are unavailable, respond with JSON only:
{"chosenRootCauseId":"hyp_…","proposedFixSummary":"...","touchedFiles":["path"]}
Choose among the provided hypothesis ids. Keep the fix summary short. Name every file that must change in touchedFiles, as repo-relative paths taken from the evidence; the fix cannot start without one.`,
          input: {
            mode: "debug_analyze",
            writeCapability: false,
            bugDescription: input.session.bugDescription,
            hypotheses: input.session.hypotheses,
            logs: input.logs.slice(0, 40),
          },
          redactionPolicy: "secrets_and_paths",
          thinkingDepth: input.thinkingDepth,
        },
        {
          step: "debug_root_cause",
          tools: [ROOT_CAUSE_TOOL],
          maxOutputTokens: DEBUG_STEP_MAX_OUTPUT_TOKENS,
          retryMaxOutputTokens: DEBUG_STEP_RETRY_MAX_OUTPUT_TOKENS,
          accept: ({ value: answer }) => {
            const payload = RootCausePayloadSchema.parse(answer);
            const issues: string[] = [];
            if (!input.session.hypotheses.some((item) => item.id === payload.chosenRootCauseId)) {
              issues.push(
                `chosenRootCauseId: '${payload.chosenRootCauseId}' is not one of ${input.session.hypotheses.map((item) => item.id).join(", ")}`,
              );
            }
            // Without a file the fix has no target (a bug reported with no file selected is
            // fixed in the file the analysis names), so the answer has to carry one.
            if (!payload.touchedFiles.some((file) => file.trim() !== "")) {
              issues.push("touchedFiles: name at least one repo-relative file path that must change");
            }
            if (issues.length > 0) throw new StructuredIssues(issues);
            return payload;
          },
        },
      );
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
