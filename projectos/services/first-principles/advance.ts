import type {
  FirstPrinciplesAnswer,
  FirstPrinciplesConflict,
  FirstPrinciplesSession,
} from "../../contracts/first-principles.js";
import type { ModelProfile, ThinkingDepth } from "../../contracts/settings.js";
import type { LoadedProjectOSWorkspace } from "../../persistence/workspace-store.js";
import type { ModelGateway } from "../model-gateway/index.js";
import {
  applyExplorationToSession,
  mergeClaimUpdates,
} from "./explore-claims.js";
import { fallbackQuestionForLayer } from "./fallback-questions.js";
import {
  generateFirstPrinciplesLlmTurn,
  questionFromLlmTurn,
  resolveQuestionWithFallback,
} from "./llm-turn.js";
import {
  answerFirstPrinciplesTurn,
  attachActiveQuestion,
  buildThesisDraft,
  createFirstPrinciplesSession,
} from "./session-ops.js";
import { FirstPrinciplesSessionSchema } from "../../contracts/first-principles.js";

function conflictFromLlm(
  session: FirstPrinciplesSession,
  partial: NonNullable<
    NonNullable<Awaited<ReturnType<typeof generateFirstPrinciplesLlmTurn>>>["conflict"]
  >,
): FirstPrinciplesConflict {
  return {
    id: partial.id ?? `fpc_${globalThis.crypto.randomUUID()}`,
    layerId: partial.layerId ?? session.currentLayerId,
    summary: partial.summary,
    leftLabel: partial.leftLabel,
    rightLabel: partial.rightLabel,
    ...(partial.leftClaimId ? { leftClaimId: partial.leftClaimId } : {}),
    ...(partial.rightClaimId ? { rightClaimId: partial.rightClaimId } : {}),
    ...(partial.evidenceRefs?.length ? { evidenceRefs: partial.evidenceRefs } : {}),
  };
}

export async function startFirstPrinciplesWithIntelligence(input: {
  projectId: string;
  vision: string;
  chatSessionId?: string;
  workspace: LoadedProjectOSWorkspace;
  profile: ModelProfile | null;
  thinkingDepth: ThinkingDepth;
  gateway: ModelGateway;
}): Promise<FirstPrinciplesSession> {
  let session = createFirstPrinciplesSession({
    projectId: input.projectId,
    vision: input.vision,
    ...(input.chatSessionId ? { chatSessionId: input.chatSessionId } : {}),
  });

  const explored = applyExplorationToSession(session, input.workspace);
  session = explored.session;

  if (explored.conflict) {
    return FirstPrinciplesSessionSchema.parse({
      ...session,
      status: "conflict",
      pendingConflict: explored.conflict,
      activeQuestion: null,
    });
  }

  if (!input.profile) {
    return session;
  }

  const turn = await generateFirstPrinciplesLlmTurn({
    session,
    profile: input.profile,
    thinkingDepth: input.thinkingDepth,
    gateway: input.gateway,
    explorationMarkdown: explored.explorationMarkdown,
  });

  if (turn?.claimUpdates?.length) {
    session = mergeClaimUpdates(session, turn.claimUpdates);
  }

  if (turn?.kind === "conflict" && turn.conflict) {
    return FirstPrinciplesSessionSchema.parse({
      ...session,
      status: "conflict",
      pendingConflict: conflictFromLlm(session, turn.conflict),
      activeQuestion: null,
    });
  }

  if (turn?.kind === "thesis_ready") {
    return FirstPrinciplesSessionSchema.parse({
      ...session,
      status: "thesis_review",
      thesis: buildThesisDraft(session),
      activeQuestion: null,
      pendingConflict: null,
    });
  }

  const question = resolveQuestionWithFallback(session, turn);
  return attachActiveQuestion(session, question);
}

export async function advanceFirstPrinciplesWithIntelligence(input: {
  session: FirstPrinciplesSession;
  answer: Omit<FirstPrinciplesAnswer, "answeredAt"> & { answeredAt?: string };
  workspace: LoadedProjectOSWorkspace;
  profile: ModelProfile | null;
  thinkingDepth: ThinkingDepth;
  gateway: ModelGateway;
}): Promise<FirstPrinciplesSession> {
  // Pre-generate next question for wrong_question / next layer using current session context.
  let explorationMarkdown = input.session.explorationSummary ?? "";
  let preConflict: FirstPrinciplesConflict | null = null;

  const exploredBefore = applyExplorationToSession(input.session, input.workspace);
  explorationMarkdown = exploredBefore.explorationMarkdown || explorationMarkdown;
  let working = exploredBefore.session;
  if (exploredBefore.conflict && input.answer.kind !== "wrong_question") {
    preConflict = exploredBefore.conflict;
  }

  let turn = null as Awaited<ReturnType<typeof generateFirstPrinciplesLlmTurn>>;
  if (input.profile && !preConflict) {
    turn = await generateFirstPrinciplesLlmTurn({
      session: working,
      profile: input.profile,
      thinkingDepth: input.thinkingDepth,
      gateway: input.gateway,
      explorationMarkdown,
    });
  }

  if (turn?.claimUpdates?.length) {
    working = mergeClaimUpdates(working, turn.claimUpdates);
  }

  if (turn?.kind === "conflict" && turn.conflict) {
    preConflict = conflictFromLlm(working, turn.conflict);
  }

  const nextQuestion =
    turn && turn.kind === "question" ? questionFromLlmTurn(working, turn) : null;

  // For wrong_question: replace in-place using LLM question if available.
  if (input.answer.kind === "wrong_question") {
    return answerFirstPrinciplesTurn(working, input.answer, {
      ...(nextQuestion ? { nextQuestion } : {}),
    });
  }

  if (preConflict) {
    return answerFirstPrinciplesTurn(working, input.answer, {
      enterConflict: preConflict,
    });
  }

  if (turn?.kind === "thesis_ready" || turn?.skipRemainingLayers) {
    return answerFirstPrinciplesTurn(working, input.answer, {
      skipToThesis: true,
    });
  }

  // Attach LLM question for the *next* layer: temporarily set currentLayer so
  // questionFromLlmTurn ids the next layer. Simpler: if LLM returned a question
  // for current layer mid-flight, use fallback advance then overwrite.
  let advanced = answerFirstPrinciplesTurn(working, input.answer, {});

  if (advanced.status === "layer_active" && nextQuestion) {
    // Re-ask LLM keyed to the new layer for a better question when the prior
    // turn was generated against the old layer.
    if (input.profile && nextQuestion.layerId !== advanced.currentLayerId) {
      const retargeted = await generateFirstPrinciplesLlmTurn({
        session: advanced,
        profile: input.profile,
        thinkingDepth: input.thinkingDepth,
        gateway: input.gateway,
        explorationMarkdown,
      });
      if (retargeted?.claimUpdates?.length) {
        advanced = mergeClaimUpdates(advanced, retargeted.claimUpdates);
      }
      if (retargeted?.kind === "conflict" && retargeted.conflict) {
        return FirstPrinciplesSessionSchema.parse({
          ...advanced,
          status: "conflict",
          pendingConflict: conflictFromLlm(advanced, retargeted.conflict),
          activeQuestion: null,
        });
      }
      if (retargeted?.kind === "thesis_ready") {
        return FirstPrinciplesSessionSchema.parse({
          ...advanced,
          status: "thesis_review",
          thesis: buildThesisDraft(advanced),
          activeQuestion: null,
          pendingConflict: null,
        });
      }
      const q = resolveQuestionWithFallback(advanced, retargeted);
      return attachActiveQuestion(advanced, q);
    }
    if (nextQuestion.layerId === advanced.currentLayerId) {
      return attachActiveQuestion(advanced, nextQuestion);
    }
  }

  if (advanced.status === "layer_active" && !advanced.activeQuestion) {
    return attachActiveQuestion(
      advanced,
      fallbackQuestionForLayer(advanced.currentLayerId, advanced),
    );
  }

  return advanced;
}
