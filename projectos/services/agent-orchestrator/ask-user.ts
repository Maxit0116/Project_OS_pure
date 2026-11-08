import { z } from "zod";

import type { RunDecision } from "../../contracts/run-state.js";

/**
 * A question the model may put to the person in the middle of a run, instead of guessing.
 *
 * It travels as a plain JSON reply with a single `ask_user` key, so every step keeps its own reply
 * parser: the orchestrator answers the question first and asks the step again with the person's
 * answer, and the step never sees the question at all.
 */
const AskUserReplySchema = z.object({
  ask_user: z.object({
    question: z.string().trim().min(1).max(400),
    options: z.array(z.object({
      id: z.string().trim().min(1).max(60),
      label: z.string().trim().min(1).max(120),
    }).passthrough()).min(2).max(4),
    recommendation: z.string().trim().min(1).max(300).optional(),
  }).passthrough(),
}).strict();

export interface AskedQuestion {
  question: string;
  options: Array<{ id: string; label: string }>;
  recommendation?: string;
}

/** What the person answered, as the model is shown it for the rest of the run. */
export interface AnsweredQuestion {
  question: string;
  answer: string;
  /** True when the person chose not to decide and left it to the agent. */
  leftToAgent?: boolean;
}

/** At most this many questions in one run: a person asked more than twice is being used as a form. */
export const MAX_RUN_QUESTIONS = 2;

/** The steps that may ask. A reviewer or a refiner has nothing to ask: it judges what it is given. */
export const ASK_USER_STAGES: ReadonlySet<string> = new Set(["plan", "locate", "generate", "edit"]);

export const ASK_USER_PROMPT = [
  "You may ask the person one question, but only when you cannot continue without it: the request leaves a product choice open that neither the request, the approved intent nor the code answers.",
  "Never ask about something you can read from the code or decide sensibly yourself, never ask about implementation detail, and ask at most once.",
  'To ask, reply with exactly one JSON object and nothing else, instead of your normal reply: {"ask_user":{"question":"...","options":[{"id":"a","label":"..."},{"id":"b","label":"..."}],"recommendation":"a"}}.',
  "Give 2 to 4 options that a person who does not know the code can choose between, and write the question and options in the language of the request.",
].join(" ");

export const USER_ANSWERS_PROMPT =
  "userAnswers are the person's answers to questions asked during this run. Treat them as part of the approved request. An answer marked leftToAgent means the person chose not to decide: use the safest reasonable assumption and state it.";

/** The question in a model reply, or undefined when the reply is a normal one. */
export function parseAskUser(output: string): AskedQuestion | undefined {
  const text = output
    .trim()
    .replace(/^```(?:json)?\s*/iu, "")
    .replace(/\s*```$/u, "");
  // Cheap exit: nearly every reply is a normal one.
  if (!text.startsWith("{") || !text.includes("ask_user")) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return undefined;
  }
  const parsed = AskUserReplySchema.safeParse(value);
  if (!parsed.success) return undefined;
  const ask = parsed.data.ask_user;
  const seen = new Set<string>();
  const options = ask.options
    .map((option) => ({ id: option.id, label: option.label }))
    .filter((option) => !seen.has(option.label) && (seen.add(option.label), true));
  if (options.length < 2) return undefined;
  const recommended = ask.recommendation
    ? options.find((option) => option.id === ask.recommendation || option.label === ask.recommendation)
    : undefined;
  return {
    question: ask.question,
    options,
    ...(recommended
      ? { recommendation: recommended.label }
      : ask.recommendation ? { recommendation: ask.recommendation } : {}),
  };
}

/** True when the text contains Chinese, so the added "leave it to the agent" option reads right. */
function writtenInChinese(text: string): boolean {
  return /[一-鿿]/u.test(text);
}

/**
 * The durable decision the person sees as a card in the chat. Option ids are the server's own
 * (`option_1`…), never the model's, so a model cannot name an option that the card treats as
 * "decline" or "stop". The last option is always the way out: leave it to the agent.
 */
export function buildQuestionDecision(input: {
  id: string;
  projectId: string;
  rootRunId: string;
  runId: string;
  nodeId?: string;
  asked: AskedQuestion;
  createdAt: string;
}): RunDecision {
  const chinese = writtenInChinese(input.asked.question);
  return {
    version: "0.1.0",
    id: input.id,
    projectId: input.projectId,
    rootRunId: input.rootRunId,
    runId: input.runId,
    ...(input.nodeId ? { nodeId: input.nodeId } : {}),
    kind: "clarification",
    question: input.asked.question,
    options: [
      ...input.asked.options.map((option, index) => ({ id: `option_${index + 1}`, label: option.label })),
      { id: "decline", label: chinese ? "由 Agent 决定" : "Let Agent decide" },
    ],
    ...(input.asked.recommendation ? { recommendation: input.asked.recommendation } : {}),
    status: "pending",
    revision: 1,
    createdAt: input.createdAt,
  };
}

/** The person's answer to a question decision, in the words the model is shown. */
export function answerFromDecision(decision: RunDecision): AnsweredQuestion {
  const note = decision.answer?.text?.trim();
  if (decision.status === "declined" || decision.answer?.optionId === "decline") {
    return {
      question: decision.question,
      answer: note ? note.slice(0, 500) : "The person left this to the agent.",
      leftToAgent: true,
    };
  }
  const label = decision.options.find((option) => option.id === decision.answer?.optionId)?.label ??
    decision.answer?.optionId ?? "";
  return {
    question: decision.question,
    answer: note ? `${label}. ${note}`.slice(0, 600) : label,
  };
}

/** The request with the person's answers added to its input; the original is not changed. */
export function withUserAnswers<T extends { input?: unknown; systemPrompt?: string | undefined }>(
  request: T,
  answers: readonly AnsweredQuestion[],
): T {
  if (answers.length === 0) return request;
  const input = request.input !== null && typeof request.input === "object" && !Array.isArray(request.input)
    ? request.input as Record<string, unknown>
    : { taskInput: request.input };
  return {
    ...request,
    systemPrompt: [request.systemPrompt, USER_ANSWERS_PROMPT].filter(Boolean).join("\n\n"),
    input: { ...input, userAnswers: answers.map((answer) => ({ ...answer })) },
  };
}

/** The request with the invitation to ask appended to its instructions. */
export function withAskUserOption<T extends { systemPrompt?: string | undefined }>(request: T): T {
  return {
    ...request,
    systemPrompt: [request.systemPrompt, ASK_USER_PROMPT].filter(Boolean).join("\n\n"),
  };
}
