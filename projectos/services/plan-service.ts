import { z } from "zod";

import type { AgentContextBundle } from "../contracts/local-context.js";
import type {
  ClarifyingQuestion,
  ImplementationPlan,
  ImplementationPlanStep,
  ImplementationPlanTodo,
} from "../contracts/implementation-plan.js";
import type { AgentConversationScope } from "../contracts/agent-conversation.js";
import type { ModelProfile, ThinkingDepth } from "../contracts/settings.js";
import { ProjectOSError } from "../errors.js";
import { ModelGateway } from "./model-gateway/index.js";
import { orderedModelOutputSources } from "./model-json-output.js";
import { separateLeadingThinkBlock } from "./model-gateway/providers.js";

const PLAN_SYSTEM_PROMPT = `You create implementation plans for a graph-driven IDE.
Respond with JSON only using this shape:
{
  "objective": "string",
  "steps": [
    {
      "id": "step_1",
      "description": "string",
      "affectedFiles": ["string"],
      "acceptanceCriteria": ["string"]
    }
  ],
  "todos": [
    { "id": "todo_1", "content": "string", "status": "pending" }
  ],
  "ambiguities": ["string"],
  "clarifyingQuestions": [
    {
      "id": "q_1",
      "question": "string",
      "options": [
        { "id": "q_1_opt_a", "label": "string", "description": "optional tradeoff note" },
        { "id": "q_1_opt_b", "label": "string" }
      ]
    }
  ],
  "rationale": "string"
}
Remain read-only: never propose a diff, claim that a file was changed, or claim that a command ran.
If the request is clear enough, return an empty clarifyingQuestions array.
If important details are missing, include clarifyingQuestions with 2-4 concrete options per question.
Each option must be a specific, actionable decision tied to the user's request — not generic placeholders.
Option labels should be short; use description for tradeoffs.
When clarifyingAnswers are already provided, treat them as final decisions and return a ready plan with concrete steps and todos.
Only ask new clarifyingQuestions if a genuinely new blocker remains after those answers.
Users may also provide a custom answer in the UI, so options are suggestions rather than an exhaustive list.
List the ambiguity in ambiguities when asking clarifying questions.`;

const ModelPlanPayloadSchema = z.object({
  objective: z.string().trim().min(1),
  steps: z.array(
    z.object({
      id: z.string().trim().min(1),
      description: z.string().trim().min(1),
      affectedFiles: z.array(z.string()),
      acceptanceCriteria: z.array(z.string().trim().min(1)),
    }),
  ),
  todos: z.array(
    z.object({
      id: z.string().trim().min(1),
      content: z.string().trim().min(1),
      status: z.enum(["pending", "done"]).default("pending"),
    }),
  ),
  ambiguities: z.array(z.string()),
  clarifyingQuestions: z
    .array(
      z.object({
        id: z.string().trim().min(1),
        question: z.string().trim().min(1),
        options: z
          .array(
            z.object({
              id: z.string().trim().min(1),
              label: z.string().trim().min(1),
              description: z.string().trim().min(1).optional(),
            }),
          )
          .min(2)
          .max(5)
          .optional(),
        answer: z.string().trim().min(1).optional(),
        selectedOptionId: z.string().trim().min(1).optional(),
      }),
    )
    .optional(),
  rationale: z.string().trim().min(1),
});

export interface PlanServiceInput {
  projectId: string;
  scope: AgentConversationScope;
  objective: string;
  localContext: AgentContextBundle;
  profile: ModelProfile;
  thinkingDepth: ThinkingDepth;
  clarifyingAnswers?: Array<{ questionId: string; answer: string; selectedOptionId?: string }>;
  existingQuestions?: ClarifyingQuestion[];
  existingPlanId?: string;
  existingCreatedAt?: string;
  supplementalMarkdown?: string;
}

export class PlanService {
  constructor(private readonly gateway: ModelGateway) {}

  async createPlan(input: PlanServiceInput): Promise<ImplementationPlan> {
    const response = await this.gateway.complete(input.profile, {
      projectId: input.projectId,
      requestKind: "implementation_plan",
      modelPreference: input.profile.id,
      systemPrompt: [
        PLAN_SYSTEM_PROMPT,
        ...(input.supplementalMarkdown?.trim()
          ? [
              "The user explicitly attached additional context. Treat it as authoritative supplemental material.",
              input.supplementalMarkdown,
            ]
          : []),
      ].join("\n"),
      input: {
        mode: "plan",
        writeCapability: false,
        objective: input.objective,
        clarifyingAnswers: input.clarifyingAnswers ?? [],
        existingQuestions: input.existingQuestions ?? [],
        localContext: input.localContext,
      },
      redactionPolicy: "secrets_and_paths",
      maxOutputTokens: 4096,
      thinkingDepth: input.thinkingDepth,
    });

    const parsed = parsePlanJson(response.output, response.reasoning);
    const now = new Date().toISOString();
    const mergedQuestions = mergeClarifyingQuestions(
      normalizeClarifyingQuestions(parsed.clarifyingQuestions ?? []),
      input.clarifyingAnswers ?? [],
      input.existingQuestions ?? [],
    );
    const unanswered = mergedQuestions.filter((question) => !question.answer?.trim());
    const status = unanswered.length > 0 ? "needs_clarification" : "ready";

    return {
      version: "0.1.0",
      id: input.existingPlanId ?? `plan_${globalThis.crypto.randomUUID()}`,
      projectId: input.projectId,
      scope: input.scope,
      objective: parsed.objective,
      steps: parsed.steps as ImplementationPlanStep[],
      todos: parsed.todos as ImplementationPlanTodo[],
      ambiguities: parsed.ambiguities,
      ...(mergedQuestions.length > 0 ? { clarifyingQuestions: mergedQuestions } : {}),
      rationale: parsed.rationale,
      status,
      createdAt: input.existingCreatedAt ?? now,
      updatedAt: now,
    };
  }
}

export function mergeClarifyingQuestions(
  questions: ClarifyingQuestion[],
  answers: Array<{ questionId: string; answer: string; selectedOptionId?: string }>,
  existing: ClarifyingQuestion[],
): ClarifyingQuestion[] {
  const answerById = new Map(answers.map((item) => [item.questionId, item]));
  const merged = new Map<string, ClarifyingQuestion>();
  for (const question of [...existing, ...questions]) {
    const prior = merged.get(question.id);
    const submitted = answerById.get(question.id);
    merged.set(question.id, {
      ...prior,
      ...question,
      options: question.options ?? prior?.options,
      answer: submitted?.answer ?? question.answer ?? prior?.answer,
      ...(submitted?.selectedOptionId
        ? { selectedOptionId: submitted.selectedOptionId }
        : question.selectedOptionId
          ? { selectedOptionId: question.selectedOptionId }
          : prior?.selectedOptionId
            ? { selectedOptionId: prior.selectedOptionId }
            : {}),
    });
  }
  return [...merged.values()].map((question) => normalizeClarifyingQuestion(question));
}

export const PLAN_CUSTOM_OPTION_ID = "__custom__";

export function normalizeClarifyingQuestions(
  questions: ClarifyingQuestion[],
): ClarifyingQuestion[] {
  return questions.map((question) => normalizeClarifyingQuestion(question));
}

function normalizeClarifyingQuestion(question: ClarifyingQuestion): ClarifyingQuestion {
  if (question.options && question.options.length >= 2) {
    return question;
  }
  return {
    ...question,
    options: [
      {
        id: `${question.id}_recommended`,
        label: "Use the recommended approach for this codebase",
        description: "Follow existing patterns in the selected scope.",
      },
      {
        id: `${question.id}_minimal`,
        label: "Keep the change as small as possible",
        description: "Prefer the smallest viable implementation.",
      },
      {
        id: `${question.id}_comprehensive`,
        label: "Use a more comprehensive solution",
        description: "Allow broader changes if they improve maintainability.",
      },
    ],
  };
}

export function sanitizePlanPayload(decoded: unknown): unknown {
  if (typeof decoded !== "object" || decoded === null) {
    return decoded;
  }
  const record = decoded as Record<string, unknown>;
  if (!Array.isArray(record.clarifyingQuestions)) {
    return decoded;
  }
  return {
    ...record,
    clarifyingQuestions: record.clarifyingQuestions.map((item, index) => {
      if (typeof item !== "object" || item === null) {
        return item;
      }
      const question = item as Record<string, unknown>;
      const rawOptions = Array.isArray(question.options) ? question.options : [];
      const options = rawOptions
        .map((option, optionIndex) => {
          if (typeof option !== "object" || option === null) return null;
          const entry = option as Record<string, unknown>;
          const label = typeof entry.label === "string" ? entry.label.trim() : "";
          if (!label) return null;
          const id =
            typeof entry.id === "string" && entry.id.trim()
              ? entry.id.trim()
              : `${typeof question.id === "string" ? question.id : `q_${index + 1}`}_opt_${optionIndex + 1}`;
          const description =
            typeof entry.description === "string" && entry.description.trim()
              ? entry.description.trim()
              : undefined;
          return description ? { id, label, description } : { id, label };
        })
        .filter((option): option is { id: string; label: string; description?: string } => option !== null)
        .slice(0, 5);
      return {
        ...question,
        id:
          typeof question.id === "string" && question.id.trim()
            ? question.id.trim()
            : `q_${index + 1}`,
        question:
          typeof question.question === "string" && question.question.trim()
            ? question.question.trim()
            : "Clarification needed",
        ...(options.length >= 2 ? { options } : {}),
      };
    }),
  };
}

function parsePlanJson(
  output: string,
  reasoning?: string,
): z.infer<typeof ModelPlanPayloadSchema> {
  let sawDecodedJson = false;
  for (const source of orderedModelOutputSources(output, reasoning)) {
    for (const candidate of extractPlanJsonCandidates(source)) {
      let decoded: unknown;
      try {
        decoded = JSON.parse(candidate);
      } catch {
        continue;
      }
      sawDecodedJson = true;
      const sanitized = sanitizePlanPayload(decoded);
      const parsed = ModelPlanPayloadSchema.safeParse(sanitized);
      if (parsed.success) {
        return parsed.data;
      }
    }
  }

  throw new ProjectOSError(
    "plan_generation_failed",
    sawDecodedJson
      ? "The model returned an invalid implementation plan"
      : "The model returned malformed implementation plan JSON",
  );
}

function extractPlanJsonCandidates(output: string): string[] {
  const content = separateLeadingThinkBlock(output).output;
  const sources = [
    ...Array.from(content.matchAll(/```(?:json)?\s*([\s\S]*?)```/giu)).map(
      (match) => match[1] ?? "",
    ),
    content,
  ];
  const candidates: string[] = [];
  const seen = new Set<string>();
  for (const source of sources) {
    const fencedOrWhole = source.trim();
    if (!fencedOrWhole) continue;
    const start = fencedOrWhole.indexOf("{");
    const end = fencedOrWhole.lastIndexOf("}");
    const slice =
      start >= 0 && end > start
        ? fencedOrWhole.slice(start, end + 1)
        : fencedOrWhole;
    if (slice && !seen.has(slice)) {
      seen.add(slice);
      candidates.push(slice);
    }
  }
  return candidates;
}

export function buildPromptFromPlan(plan: ImplementationPlan): string {
  const stepLines = plan.steps
    .map(
      (step, index) =>
        `${index + 1}. ${step.description}\n   Files: ${step.affectedFiles.join(", ") || "n/a"}\n   Acceptance: ${step.acceptanceCriteria.join("; ")}`,
    )
    .join("\n");
  const todoLines = plan.todos.map((todo) => `- [${todo.status}] ${todo.content}`).join("\n");
  return [
    `Objective: ${plan.objective}`,
    "",
    "Implementation steps:",
    stepLines,
    "",
    "Todos:",
    todoLines,
    "",
    `Rationale: ${plan.rationale}`,
  ].join("\n");
}
