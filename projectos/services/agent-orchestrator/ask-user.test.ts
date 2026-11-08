import { describe, expect, it } from "vitest";

import type { RunDecision } from "../../contracts/run-state.js";
import {
  answerFromDecision,
  buildQuestionDecision,
  parseAskUser,
  withAskUserOption,
  withUserAnswers,
} from "./ask-user.js";

const ask = (overrides: Record<string, unknown> = {}) => JSON.stringify({
  ask_user: {
    question: "Which address?",
    options: [{ id: "a", label: "Account email" }, { id: "b", label: "Another address" }],
    recommendation: "a",
    ...overrides,
  },
});

describe("parseAskUser", () => {
  it("reads a question, and turns the recommended id into its label", () => {
    expect(parseAskUser(ask())).toEqual({
      question: "Which address?",
      options: [{ id: "a", label: "Account email" }, { id: "b", label: "Another address" }],
      recommendation: "Account email",
    });
  });

  it("reads a question wrapped in a code fence", () => {
    expect(parseAskUser(`\`\`\`json\n${ask()}\n\`\`\``)?.question).toBe("Which address?");
  });

  it("leaves an ordinary reply alone", () => {
    expect(parseAskUser('{"objective":"x","tasks":[]}')).toBeUndefined();
    expect(parseAskUser("plain words, ask_user mentioned")).toBeUndefined();
    expect(parseAskUser("")).toBeUndefined();
  });

  it("is not fooled by a reply that merely contains the word", () => {
    expect(parseAskUser('{"objective":"explain ask_user in the docs","tasks":[]}')).toBeUndefined();
  });

  it("refuses a question that is not worth a person's time or is malformed", () => {
    expect(parseAskUser(ask({ options: [{ id: "a", label: "Only one" }] }))).toBeUndefined();
    expect(parseAskUser(ask({ options: [{ id: "a", label: "Same" }, { id: "b", label: "Same" }] }))).toBeUndefined();
    expect(parseAskUser(ask({ question: "" }))).toBeUndefined();
    expect(parseAskUser(ask({ options: Array.from({ length: 5 }, (_, index) => ({ id: `o${index}`, label: `Option ${index}` })) }))).toBeUndefined();
    expect(parseAskUser('{"ask_user":{"question":"q"},"tasks":[]}')).toBeUndefined();
  });
});

describe("buildQuestionDecision", () => {
  const base = {
    id: "decision_run_1_question_1",
    projectId: "project_1",
    rootRunId: "run_1",
    runId: "run_1",
    createdAt: "2026-11-05T00:00:00.000Z",
  };

  it("uses its own option ids, so a model cannot name an option the card treats as decline or stop", () => {
    const decision = buildQuestionDecision({
      ...base,
      asked: { question: "Pick one", options: [{ id: "decline", label: "Skip it" }, { id: "stop", label: "Halt" }] },
    });
    expect(decision.options.map((option) => option.id)).toEqual(["option_1", "option_2", "decline"]);
    expect(decision.status).toBe("pending");
    expect(decision.kind).toBe("clarification");
  });

  it("words the way out in the language of the question", () => {
    expect(buildQuestionDecision({ ...base, asked: { question: "发给哪个地址？", options: [{ id: "a", label: "账号邮箱" }, { id: "b", label: "其他" }] } }).options.at(-1)?.label)
      .toBe("由 Agent 决定");
    expect(buildQuestionDecision({ ...base, asked: { question: "Which?", options: [{ id: "a", label: "A" }, { id: "b", label: "B" }] } }).options.at(-1)?.label)
      .toBe("Let Agent decide");
  });
});

describe("answerFromDecision", () => {
  const decision = (patch: Partial<RunDecision>): RunDecision => ({
    version: "0.1.0",
    id: "d",
    projectId: "p",
    rootRunId: "r",
    runId: "r",
    kind: "clarification",
    question: "Which?",
    options: [{ id: "option_1", label: "A" }, { id: "option_2", label: "B" }, { id: "decline", label: "Let Agent decide" }],
    status: "resolved",
    revision: 2,
    createdAt: "2026-11-05T00:00:00.000Z",
    ...patch,
  });

  it("gives the option's label, and the person's note after it", () => {
    expect(answerFromDecision(decision({ answer: { optionId: "option_2" } }))).toEqual({ question: "Which?", answer: "B" });
    expect(answerFromDecision(decision({ answer: { optionId: "option_2", text: "the billing one" } }))).toEqual({ question: "Which?", answer: "B. the billing one" });
  });

  it("marks a declined question as left to the agent", () => {
    expect(answerFromDecision(decision({ status: "declined", answer: { optionId: "decline" } })))
      .toEqual({ question: "Which?", answer: "The person left this to the agent.", leftToAgent: true });
  });
});

describe("what a request carries", () => {
  it("adds answers to the input and a line to the instructions, without changing the original", () => {
    const original = { systemPrompt: "base", input: { mode: "plan" } };
    const changed = withUserAnswers(original, [{ question: "Q", answer: "A" }]);
    expect(changed.input).toEqual({ mode: "plan", userAnswers: [{ question: "Q", answer: "A" }] });
    expect(changed.systemPrompt).toMatch(/^base\n\nuserAnswers are the person's answers/u);
    expect(original).toEqual({ systemPrompt: "base", input: { mode: "plan" } });
  });

  it("returns the request untouched when there are no answers", () => {
    const original = { systemPrompt: "base", input: {} };
    expect(withUserAnswers(original, [])).toBe(original);
  });

  it("adds the invitation to ask to the instructions only", () => {
    const changed = withAskUserOption({ systemPrompt: "base", input: { x: 1 } });
    expect(changed.systemPrompt).toMatch(/^base\n\nYou may ask the person one question/u);
    expect(changed.input).toEqual({ x: 1 });
  });
});
