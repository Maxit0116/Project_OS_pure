import type {
  AlignmentContract,
  AlignmentItem,
  AlignmentQuestion,
  ConfirmAlignmentAnswer,
  ConfirmAlignmentItemPatch,
  ConfirmAlignmentRequest,
} from "../contracts/alignment-contract.js";
import {
  AlignmentContractSchema,
  ConfirmAlignmentRequestSchema,
} from "../contracts/alignment-contract.js";
import type { PromptRefinement } from "../contracts/prompt-refinement.js";

const MAX_ITEMS = 12;
const MAX_QUESTIONS = 5;
const MAX_BLOCKING = 3;

export function ensureAlignmentOnRefinement(
  refinement: PromptRefinement,
  rawPrompt?: string,
): PromptRefinement {
  if (refinement.alignment) {
    return {
      ...refinement,
      alignment: normalizeAlignmentContract(refinement.alignment, refinement.id, rawPrompt),
    };
  }
  return {
    ...refinement,
    alignment: synthesizeAlignmentFromLegacy(refinement, rawPrompt),
  };
}

export function synthesizeAlignmentFromLegacy(
  refinement: PromptRefinement,
  rawPrompt?: string,
): AlignmentContract {
  const items: AlignmentItem[] = [];
  const statedTexts = splitIntoShortStatements(refinement.understood);
  for (const [index, text] of statedTexts.entries()) {
    items.push({
      id: `${refinement.id}_stated_${index + 1}`,
      kind: "stated",
      text,
      selected: true,
    });
  }
  if (items.length === 0) {
    items.push({
      id: `${refinement.id}_stated_1`,
      kind: "stated",
      text: (rawPrompt ?? refinement.understood).trim().slice(0, 500) || "Implement the user request",
      selected: true,
    });
  }

  for (const [index, text] of refinement.ambiguities.slice(0, 6).entries()) {
    const trimmed = text.trim();
    if (!trimmed) continue;
    items.push({
      id: `${refinement.id}_guess_${index + 1}`,
      kind: "guess",
      text: trimmed.slice(0, 500),
      selected: false,
    });
  }

  // Ambiguities that look like decisions become blocking questions when suggestions exist.
  const questions: AlignmentQuestion[] = [];
  const decisionHints = refinement.suggestions
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 4);
  if (refinement.ambiguities.length > 0 && decisionHints.length >= 2) {
    questions.push({
      id: `${refinement.id}_q_scope`,
      question: refinement.ambiguities[0]!.trim().slice(0, 300) || "How should this change be scoped?",
      topic: "scope",
      blocking: true,
      options: decisionHints.slice(0, 4).map((label, index) => ({
        id: `${refinement.id}_q_scope_opt_${index + 1}`,
        label: label.slice(0, 120),
      })),
    });
  } else if (refinement.affectedFiles.length > 1) {
    questions.push({
      id: `${refinement.id}_q_scope`,
      question: "How wide should this change be?",
      topic: "scope",
      blocking: true,
      options: [
        {
          id: `${refinement.id}_q_scope_minimal`,
          label: "Only the primary target file",
          description: "Keep writes as narrow as possible.",
        },
        {
          id: `${refinement.id}_q_scope_related`,
          label: "Primary file plus closely related files",
          description: "Allow small supporting edits when needed.",
        },
        {
          id: `${refinement.id}_q_scope_broader`,
          label: "Broader related surface",
          description: "Accept a wider edit set if it improves consistency.",
        },
      ],
    });
  }

  return normalizeAlignmentContract(
    {
      version: "0.1.0",
      id: `align_${refinement.id}`,
      ...(rawPrompt ? { rawPrompt } : {}),
      items: items.slice(0, MAX_ITEMS),
      questions: questions.slice(0, MAX_QUESTIONS),
      confidence: refinement.confidence,
      status: "awaiting_user",
    },
    refinement.id,
    rawPrompt,
  );
}

export function normalizeAlignmentContract(
  contract: AlignmentContract,
  refinementId: string,
  rawPrompt?: string,
): AlignmentContract {
  const items = contract.items.slice(0, MAX_ITEMS).map((item, index) => ({
    ...item,
    id: item.id || `${refinementId}_item_${index + 1}`,
    text: item.text.trim().slice(0, 500),
    selected:
      item.kind === "guess" ? item.selected === true : item.selected !== false,
    ...(item.comment?.trim() ? { comment: item.comment.trim().slice(0, 2_000) } : {}),
  }));

  let blockingCount = 0;
  const questions = contract.questions.slice(0, MAX_QUESTIONS).map((question, index) => {
    const blocking = question.blocking !== false && blockingCount < MAX_BLOCKING
      ? true
      : false;
    if (blocking) blockingCount += 1;
    return {
      ...question,
      id: question.id || `${refinementId}_q_${index + 1}`,
      question: question.question.trim().slice(0, 500),
      topic: question.topic ?? "other",
      blocking,
      ...(question.options
        ? {
            options: question.options.slice(0, 5).map((option, optionIndex) => ({
              ...option,
              id: option.id || `${refinementId}_q_${index + 1}_opt_${optionIndex + 1}`,
              label: option.label.trim().slice(0, 200),
            })),
          }
        : {}),
    };
  });

  return AlignmentContractSchema.parse({
    version: "0.1.0",
    id: contract.id || `align_${refinementId}`,
    ...(rawPrompt ?? contract.rawPrompt
      ? { rawPrompt: (rawPrompt ?? contract.rawPrompt)!.slice(0, 20_000) }
      : {}),
    items,
    questions,
    ...(typeof contract.confidence === "number"
      ? { confidence: contract.confidence }
      : {}),
    status: contract.status ?? "awaiting_user",
  });
}

/** Smart-skip: short stated-only contracts with no unanswered blocking questions. */
export function canSkipAlignment(refinement: PromptRefinement): boolean {
  // Legacy / mock payloads may omit alignment — synthesize before judging skip.
  const alignment = ensureAlignmentOnRefinement(refinement).alignment;
  if (!alignment) return false;
  if (alignment.status === "confirmed") return true;
  const stated = alignment.items.filter((item) => item.kind === "stated");
  const guesses = alignment.items.filter((item) => item.kind === "guess");
  const blockingUnanswered = alignment.questions.filter(
    (question) =>
      question.blocking !== false &&
      !question.answer?.trim() &&
      !question.selectedOptionId,
  );
  if (blockingUnanswered.length > 0) return false;
  if (stated.length === 0 || stated.length > 2) return false;
  if (guesses.some((item) => item.selected)) return false;
  if (guesses.length > 2) return false;
  if (typeof refinement.confidence === "number" && refinement.confidence < 0.75) {
    return false;
  }
  if (refinement.affectedFiles.length > 1) return false;
  return true;
}

export function isAlignmentReadyToConfirm(
  contract: AlignmentContract,
  itemPatches: ConfirmAlignmentItemPatch[],
  answers: ConfirmAlignmentAnswer[],
): { ok: true } | { ok: false; reason: string } {
  const selectedById = new Map(itemPatches.map((patch) => [patch.id, patch]));
  const selectedCount = contract.items.filter((item) => {
    const patch = selectedById.get(item.id);
    return (patch?.selected ?? item.selected) === true;
  }).length;
  if (selectedCount < 1) {
    return { ok: false, reason: "Select at least one requirement statement." };
  }

  const answerById = new Map(answers.map((answer) => [answer.questionId, answer]));
  for (const question of contract.questions) {
    if (question.blocking === false) continue;
    const answer = answerById.get(question.id);
    if (!answer?.answer.trim()) {
      return { ok: false, reason: "Answer all blocking design questions." };
    }
  }
  return { ok: true };
}

export function applyAlignmentConfirmation(
  refinement: PromptRefinement,
  request: ConfirmAlignmentRequest,
): PromptRefinement {
  const parsed = ConfirmAlignmentRequestSchema.parse(request);
  const withAlignment = ensureAlignmentOnRefinement(refinement);
  const contract = withAlignment.alignment!;
  if (contract.id !== parsed.contractId) {
    throw new Error("Alignment contract id mismatch");
  }

  const gate = isAlignmentReadyToConfirm(contract, parsed.items, parsed.answers);
  if (!gate.ok) {
    throw new Error(gate.reason);
  }

  const patchById = new Map(parsed.items.map((item) => [item.id, item]));
  const answerById = new Map(parsed.answers.map((answer) => [answer.questionId, answer]));

  const items = contract.items.map((item) => {
    const patch = patchById.get(item.id);
    if (!patch) return item;
    return {
      ...item,
      selected: patch.selected,
      ...(patch.comment?.trim()
        ? { comment: patch.comment.trim() }
        : item.comment
          ? { comment: item.comment }
          : {}),
    };
  });

  const questions = contract.questions.map((question) => {
    const answer = answerById.get(question.id);
    if (!answer) return question;
    return {
      ...question,
      answer: answer.answer.trim(),
      ...(answer.selectedOptionId
        ? { selectedOptionId: answer.selectedOptionId }
        : {}),
    };
  });

  const confirmed: AlignmentContract = {
    ...contract,
    items,
    questions,
    status: "confirmed",
  };

  return {
    ...withAlignment,
    understood: buildUnderstoodFromAlignment(confirmed),
    ambiguities: items
      .filter((item) => item.kind === "guess" && !item.selected)
      .map((item) => item.text),
    suggestions: questions
      .filter((question) => question.answer?.trim())
      .map((question) => `${question.question} → ${question.answer}`),
    alignment: confirmed,
  };
}

export function buildUnderstoodFromAlignment(contract: AlignmentContract): string {
  const lines: string[] = [];
  const included = contract.items.filter((item) => item.selected);
  const excluded = contract.items.filter(
    (item) => !item.selected && item.kind === "stated",
  );

  if (included.length > 0) {
    lines.push("Confirmed requirements:");
    for (const item of included) {
      const comment = item.comment?.trim();
      lines.push(
        comment ? `- ${item.text} (note: ${comment})` : `- ${item.text}`,
      );
    }
  }

  if (excluded.length > 0) {
    lines.push("Explicitly out of scope for this run:");
    for (const item of excluded) {
      lines.push(`- ${item.text}`);
    }
  }

  const unansweredGuesses = contract.items.filter(
    (item) => item.kind === "guess" && !item.selected,
  );
  if (unansweredGuesses.length > 0) {
    lines.push("Do not implement these unconfirmed guesses:");
    for (const item of unansweredGuesses) {
      lines.push(`- ${item.text}`);
    }
  }

  const answered = contract.questions.filter((question) => question.answer?.trim());
  if (answered.length > 0) {
    lines.push("Design decisions:");
    for (const question of answered) {
      lines.push(`- ${question.question} → ${question.answer}`);
    }
  }

  return lines.join("\n").trim() || "Implement the confirmed user request.";
}

function splitIntoShortStatements(text: string): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];
  const byBreak = normalized
    .split(/(?<=[.!;。；])\s+|\n+|;\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (byBreak.length >= 2) {
    return byBreak.slice(0, 8).map((part) => part.slice(0, 500));
  }
  if (normalized.length <= 160) return [normalized.slice(0, 500)];
  // Soft-split long prose on commas / "and" as a last resort.
  const soft = normalized
    .split(/,\s+|\band\b/i)
    .map((part) => part.trim())
    .filter((part) => part.length > 12);
  return (soft.length >= 2 ? soft : [normalized]).slice(0, 6).map((part) => part.slice(0, 500));
}
