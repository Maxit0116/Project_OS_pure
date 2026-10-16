import { randomUUID } from "node:crypto";

import type {
  LoopAuthoringMessage,
  LoopAuthoringTrace,
  LoopAuthoringTraceStep,
  LoopGoalContext,
  LoopOpenQuestion,
} from "../contracts/loop-graph.js";

function nowIso(): string {
  return new Date().toISOString();
}

function step(
  kind: LoopAuthoringTraceStep["kind"],
  label: string,
): LoopAuthoringTraceStep {
  return {
    id: `step_${randomUUID()}`,
    kind,
    label,
    at: nowIso(),
  };
}

export function buildRunningTrace(steps: LoopAuthoringTraceStep[]): LoopAuthoringTrace {
  const current = steps[steps.length - 1];
  return {
    status: "running",
    currentStepId: current?.id,
    steps,
  };
}

export function buildCompleteTrace(steps: LoopAuthoringTraceStep[]): LoopAuthoringTrace {
  const current = steps[steps.length - 1];
  return {
    status: "complete",
    currentStepId: current?.id,
    steps,
  };
}

export function makeAuthoringMessage(
  role: LoopAuthoringMessage["role"],
  content: string,
): LoopAuthoringMessage {
  return {
    id: `msg_${randomUUID()}`,
    role,
    content: content.trim(),
    timestamp: nowIso(),
  };
}

function needsClarification(text: string, prior?: LoopGoalContext | null): boolean {
  if (prior && prior.openQuestions.some((q) => !q.answer?.trim())) return false;
  const trimmed = text.trim();
  if (trimmed.length < 24) return true;
  if (!prior && !/\b(verify|test|验收|约束|constraint|done|when)\b/i.test(trimmed)) {
    return true;
  }
  return false;
}

function defaultClarifyingQuestions(goal: string): LoopOpenQuestion[] {
  return [
    {
      id: `q_${randomUUID()}`,
      question: `What counts as done for “${goal.slice(0, 80)}”?`,
      options: ["Automated tests pass", "Manual review OK", "Both"],
    },
    {
      id: `q_${randomUUID()}`,
      question: "Any hard constraints (APIs, schema, scope)?",
      options: ["No schema changes", "Stay in current package", "Other"],
    },
  ];
}

/** Deterministic Ask stub: refine draft goal context from the latest user turn. */
export function authorLoopGoalContextHeuristic(input: {
  userText: string;
  threadLength: number;
  prior?: LoopGoalContext;
}): {
  draftGoalContext: LoopGoalContext;
  assistantMessage: string;
  steps: LoopAuthoringTraceStep[];
  needsClarification: boolean;
} {
  const steps = [
    step("thinking", "Understanding the loop goal"),
    step("writing_context", "Updating goal context draft"),
  ];
  const goal =
    input.prior?.goal?.trim() ||
    input.userText.trim().split(/\n/)[0]?.trim().slice(0, 1000) ||
    "Untitled loop goal";

  const constraints = [...(input.prior?.constraints ?? [])];
  const doneWhen = [...(input.prior?.doneWhen ?? [])];
  const outOfScope = [...(input.prior?.outOfScope ?? [])];

  const constraintMatch = input.userText.match(
    /(?:constraint|约束)[:：]\s*(.+)/i,
  );
  if (constraintMatch?.[1]) {
    const next = constraintMatch[1].trim().slice(0, 500);
    if (next && !constraints.includes(next)) constraints.push(next);
  }

  const doneMatch = input.userText.match(/(?:done when|完成条件)[:：]\s*(.+)/i);
  if (doneMatch?.[1]) {
    const next = doneMatch[1].trim().slice(0, 500);
    if (next && !doneWhen.includes(next)) doneWhen.push(next);
  }

  const outMatch = input.userText.match(/(?:out of scope|不在范围)[:：]\s*(.+)/i);
  if (outMatch?.[1]) {
    const next = outMatch[1].trim().slice(0, 500);
    if (next && !outOfScope.includes(next)) outOfScope.push(next);
  }

  if (constraints.length === 0 && /no schema|不改.*schema|schema/i.test(input.userText)) {
    constraints.push("Do not change the database schema");
  }

  const clarify = needsClarification(input.userText, input.prior);
  const openQuestions =
    clarify && (!input.prior || input.prior.openQuestions.length === 0)
      ? defaultClarifyingQuestions(goal)
      : (input.prior?.openQuestions ?? []).map((q) => ({ ...q }));

  const draftGoalContext: LoopGoalContext = {
    goal,
    constraints: constraints.slice(0, 20),
    doneWhen: doneWhen.slice(0, 20),
    outOfScope: outOfScope.slice(0, 20),
    openQuestions,
    status: "draft",
    revision: (input.prior?.revision ?? 0) + 1,
    updatedAt: nowIso(),
    sourceThreadLength: input.threadLength + 1,
  };

  const assistantMessage = clarify
    ? `Drafted a goal context for “${goal}”. Please answer the clarifying questions, then confirm when ready.`
    : `Updated goal context (rev ${draftGoalContext.revision}): ${goal}${
        constraints.length ? ` · ${constraints.length} constraint(s)` : ""
      }. Confirm when this looks right, then we can offer a coarse graph draft.`;

  return {
    draftGoalContext,
    assistantMessage,
    steps,
    needsClarification: clarify && openQuestions.some((q) => !q.answer?.trim()),
  };
}

export function applyLoopGoalClarificationHeuristic(input: {
  draft: LoopGoalContext;
  answers: Array<{ questionId: string; answer: string }>;
  threadLength: number;
}): {
  draftGoalContext: LoopGoalContext;
  assistantMessage: string;
  steps: LoopAuthoringTraceStep[];
} {
  const steps = [
    step("thinking", "Applying clarification answers"),
    step("writing_context", "Refreshing goal context"),
  ];
  const answerById = new Map(input.answers.map((a) => [a.questionId, a.answer.trim()]));
  const openQuestions = input.draft.openQuestions.map((q) => {
    const answer = answerById.get(q.id);
    return answer ? { ...q, answer } : q;
  });

  let doneWhen = [...input.draft.doneWhen];
  let constraints = [...input.draft.constraints];
  for (const q of openQuestions) {
    if (!q.answer) continue;
    if (/done|完成|test|验收/i.test(q.question) && !doneWhen.includes(q.answer)) {
      doneWhen = [...doneWhen, q.answer].slice(0, 20);
    }
    if (/constraint|约束/i.test(q.question) && !constraints.includes(q.answer)) {
      constraints = [...constraints, q.answer].slice(0, 20);
    }
  }

  const draftGoalContext: LoopGoalContext = {
    ...input.draft,
    doneWhen,
    constraints,
    openQuestions,
    status: "draft",
    revision: input.draft.revision + 1,
    updatedAt: nowIso(),
    sourceThreadLength: input.threadLength + 1,
  };

  return {
    draftGoalContext,
    assistantMessage:
      "Thanks — I folded your answers into the goal context. Review and confirm when ready.",
    steps,
  };
}
