import {
  FIRST_PRINCIPLES_LAYER_ORDER,
  FIRST_PRINCIPLES_TURN_SOFT_LIMIT,
  FirstPrinciplesSessionSchema,
  type FirstPrinciplesAnswer,
  type FirstPrinciplesConflict,
  type FirstPrinciplesConflictResolution,
  type FirstPrinciplesHandoffPayload,
  type FirstPrinciplesHandoffTarget,
  type FirstPrinciplesLayerId,
  type FirstPrinciplesLayerState,
  type FirstPrinciplesQuestion,
  type FirstPrinciplesSession,
  type FirstPrinciplesThesis,
  type FirstPrinciplesVerdict,
} from "../../contracts/first-principles.js";
import { ProjectOSError } from "../../errors.js";
import { fallbackQuestionForLayer } from "./fallback-questions.js";

export interface AnswerTurnOptions {
  /** Override fallback when advancing to the next layer / retry. */
  nextQuestion?: FirstPrinciplesQuestion;
  /** Enter conflict gate instead of advancing. */
  enterConflict?: FirstPrinciplesConflict;
  /** Jump to thesis_review after recording the answer. */
  skipToThesis?: boolean;
}

function nowIso(): string {
  return new Date().toISOString();
}

function emptyLayers(): FirstPrinciplesLayerState[] {
  return FIRST_PRINCIPLES_LAYER_ORDER.map((id) => ({
    id,
    status: id === "L0" ? "active" : "pending",
    questions: [],
    answers: [],
  }));
}

function layerIndex(id: FirstPrinciplesLayerId): number {
  return FIRST_PRINCIPLES_LAYER_ORDER.indexOf(id);
}

function nextLayerId(
  id: FirstPrinciplesLayerId,
): FirstPrinciplesLayerId | null {
  const idx = layerIndex(id);
  if (idx < 0 || idx >= FIRST_PRINCIPLES_LAYER_ORDER.length - 1) return null;
  return FIRST_PRINCIPLES_LAYER_ORDER[idx + 1] ?? null;
}

function answerText(answer: FirstPrinciplesAnswer, question: FirstPrinciplesQuestion): string {
  if (answer.kind === "custom" || answer.kind === "unsure") {
    return answer.text?.trim() || answer.kind;
  }
  if (answer.kind === "skip_layer") return "(skipped layer)";
  if (answer.kind === "wrong_question") return "(wrong question)";
  const opt = question.options?.find((o) => o.id === answer.selectedOptionId);
  return opt?.label ?? answer.selectedOptionId ?? answer.kind;
}

function applyAnswerSideEffects(
  session: FirstPrinciplesSession,
  question: FirstPrinciplesQuestion,
  answer: FirstPrinciplesAnswer,
): FirstPrinciplesSession {
  const next = { ...session };
  const label = answerText(answer, question);
  const claimId = `claim_${question.id}_${answer.kind}`;

  if (question.layerId === "L0") {
    next.problemStatement = label;
    if (answer.selectedOptionId === "l0_self_pain") next.painOwner = "self";
    else if (answer.selectedOptionId === "l0_user_pain") next.painOwner = "target_user";
    else if (answer.selectedOptionId === "l0_trend") next.painOwner = "trend";
    else next.painOwner = "unknown";
  }
  if (question.layerId === "L1") {
    next.atomicClaims = [
      ...next.atomicClaims.filter((c) => c.id !== claimId),
      { id: claimId, text: label, status: "assumed" },
    ];
  }
  if (question.layerId === "L2") {
    if (answer.selectedOptionId && answer.selectedOptionId !== "l2_pass") {
      next.killedAlternatives = [...next.killedAlternatives, label].slice(-12);
    }
  }
  if (question.layerId === "L3") {
    next.mvpObligation = label;
    if (answer.selectedOptionId === "l3_fullish") {
      next.nonGoals = next.nonGoals;
    } else {
      next.nonGoals = [
        ...new Set([
          ...next.nonGoals,
          "完整权限/协作",
          "多端适配",
          "华丽设置页",
        ]),
      ].slice(0, 12);
    }
    next.acceptanceSignals = [
      ...new Set([...next.acceptanceSignals, "核心假设被真实使用验证一次"]),
    ].slice(0, 12);
  }
  return next;
}

function inferVerdict(session: FirstPrinciplesSession): FirstPrinciplesVerdict {
  const killAnswers = session.layers
    .find((l) => l.id === "L2")
    ?.answers.at(-1);
  const opt = killAnswers?.selectedOptionId;
  if (opt === "l2_workaround_ok") return "park";
  if (opt === "l2_only_me") return "kill";
  if (opt === "l2_symptom") return "pivot";
  if (session.painOwner === "trend") return "park";
  return "go";
}

export function buildThesisDraft(session: FirstPrinciplesSession): FirstPrinciplesThesis {
  const verdict = inferVerdict(session);
  const title =
    session.problemStatement?.slice(0, 80) ||
    session.rawVision.slice(0, 80) ||
    "Untitled thesis";
  return {
    title,
    thesis:
      session.problemStatement ||
      `围绕「${session.rawVision.slice(0, 100)}」是否值得做成产品功能`,
    forWhom:
      session.painOwner === "self"
        ? "主要是我自己（solo）"
        : session.painOwner === "target_user"
          ? "目标用户"
          : session.painOwner === "trend"
            ? "尚不清晰（跟风风险）"
            : "待明确",
    whyNow: "当前愿景冲动需要被最小切片验证，而不是直接铺开开发",
    mvp: session.mvpObligation || "尚未定义最小切片",
    successSignal:
      session.acceptanceSignals[0] || "有一次真实使用证明核心假设成立或失败",
    nonGoals: session.nonGoals.length > 0 ? session.nonGoals : ["本次不做完整产品化"],
    confidence: verdict === "go" ? 3 : 2,
    verdict,
  };
}

export function buildHandoffBrief(session: FirstPrinciplesSession): string {
  const t = session.thesis ?? buildThesisDraft(session);
  const claims = session.atomicClaims.map((c) => `- (${c.status}) ${c.text}`).join("\n");
  return [
    "# Thesis (First Principles)",
    `Verdict: ${t.verdict}`,
    `Confidence: ${t.confidence}/5`,
    `Statement: ${t.thesis}`,
    `For: ${t.forWhom}`,
    `Why now: ${t.whyNow}`,
    `MVP: ${t.mvp}`,
    `Success: ${t.successSignal}`,
    `Non-goals: ${t.nonGoals.join("; ")}`,
    claims ? `Claims:\n${claims}` : "",
    session.diagramIds.length
      ? `Diagrams: ${session.diagramIds.join(", ")}`
      : "",
    "",
    "Do not re-ask synonymous clarifying questions already decided above.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function collectClarifyingAnswers(
  session: FirstPrinciplesSession,
): FirstPrinciplesHandoffPayload["clarifyingAnswers"] {
  const out: FirstPrinciplesHandoffPayload["clarifyingAnswers"] = [];
  for (const layer of session.layers) {
    for (const answer of layer.answers) {
      const question = layer.questions.find((q) => q.id === answer.questionId);
      if (!question) continue;
      const text = answerText(answer, question);
      if (!text.trim()) continue;
      out.push({
        questionId: answer.questionId,
        answer: text,
        ...(answer.selectedOptionId
          ? { selectedOptionId: answer.selectedOptionId }
          : {}),
      });
    }
  }
  return out;
}

export function createFirstPrinciplesSession(input: {
  projectId: string;
  chatSessionId?: string;
  vision: string;
}): FirstPrinciplesSession {
  const createdAt = nowIso();
  const id = `fp_${globalThis.crypto.randomUUID()}`;
  const base: FirstPrinciplesSession = {
    version: "0.1.0",
    id,
    projectId: input.projectId,
    ...(input.chatSessionId ? { chatSessionId: input.chatSessionId } : {}),
    status: "layer_active",
    currentLayerId: "L0",
    rawVision: input.vision.trim(),
    layers: emptyLayers(),
    atomicClaims: [],
    killedAlternatives: [],
    acceptanceSignals: [],
    nonGoals: [],
    diagramIds: [],
    activeQuestion: null,
    turnCount: 0,
    createdAt,
    updatedAt: createdAt,
  };
  const question = fallbackQuestionForLayer("L0", base);
  const layers = base.layers.map((layer) =>
    layer.id === "L0"
      ? { ...layer, status: "active" as const, questions: [question] }
      : layer,
  );
  return FirstPrinciplesSessionSchema.parse({
    ...base,
    layers,
    activeQuestion: question,
  });
}

export function answerFirstPrinciplesTurn(
  session: FirstPrinciplesSession,
  rawAnswer: Omit<FirstPrinciplesAnswer, "answeredAt"> & {
    answeredAt?: string | undefined;
  },
  options: AnswerTurnOptions = {},
): FirstPrinciplesSession {
  if (
    session.status === "concluded" ||
    session.status === "abandoned" ||
    session.status === "thesis_review" ||
    session.status === "conflict"
  ) {
    throw new ProjectOSError(
      "plan_not_ready",
      `Cannot answer in status ${session.status}`,
    );
  }
  const question = session.activeQuestion;
  if (!question) {
    throw new ProjectOSError("plan_not_ready", "No active question");
  }
  if (rawAnswer.questionId !== question.id) {
    throw new ProjectOSError(
      "invalid_settings",
      "Answer questionId does not match active question",
    );
  }

  const answer: FirstPrinciplesAnswer = {
    ...rawAnswer,
    answeredAt: rawAnswer.answeredAt ?? nowIso(),
  };

  let next: FirstPrinciplesSession = {
    ...session,
    turnCount: session.turnCount + 1,
    updatedAt: nowIso(),
    pendingConflict: null,
  };

  if (answer.kind === "wrong_question") {
    const replacement =
      options.nextQuestion ??
      (() => {
        const fallback = fallbackQuestionForLayer(session.currentLayerId, next);
        fallback.id = `${fallback.id}_retry_${next.turnCount}`;
        return fallback;
      })();
    next = {
      ...next,
      status: "layer_active",
      activeQuestion: replacement,
      layers: next.layers.map((layer) =>
        layer.id === session.currentLayerId
          ? {
              ...layer,
              questions: [...layer.questions, replacement],
              answers: [...layer.answers, answer],
            }
          : layer,
      ),
    };
    return FirstPrinciplesSessionSchema.parse(next);
  }

  next = applyAnswerSideEffects(next, question, answer);
  next = {
    ...next,
    layers: next.layers.map((layer) =>
      layer.id === session.currentLayerId
        ? {
            ...layer,
            answers: [...layer.answers, answer],
            status:
              answer.kind === "skip_layer" ? ("skipped" as const) : layer.status,
          }
        : layer,
    ),
  };

  if (options.enterConflict) {
    return FirstPrinciplesSessionSchema.parse({
      ...next,
      status: "conflict",
      pendingConflict: options.enterConflict,
      activeQuestion: null,
    });
  }

  const forceThesis =
    options.skipToThesis ||
    next.turnCount >= FIRST_PRINCIPLES_TURN_SOFT_LIMIT;
  const advance =
    answer.kind === "skip_layer" ||
    answer.kind === "option" ||
    answer.kind === "custom" ||
    answer.kind === "unsure";

  if (forceThesis || !advance) {
    const thesis = buildThesisDraft(next);
    return FirstPrinciplesSessionSchema.parse({
      ...next,
      status: "thesis_review",
      activeQuestion: null,
      pendingConflict: null,
      thesis,
      layers: next.layers.map((layer) =>
        layer.id === session.currentLayerId && layer.status === "active"
          ? { ...layer, status: "complete" as const }
          : layer,
      ),
    });
  }

  const nxtLayer = nextLayerId(session.currentLayerId);
  if (!nxtLayer) {
    const thesis = buildThesisDraft(next);
    return FirstPrinciplesSessionSchema.parse({
      ...next,
      status: "thesis_review",
      activeQuestion: null,
      pendingConflict: null,
      thesis,
      layers: next.layers.map((layer) =>
        layer.id === session.currentLayerId
          ? { ...layer, status: "complete" as const }
          : layer,
      ),
    });
  }

  const completedCurrent = next.layers.map((layer) => {
    if (layer.id === session.currentLayerId) {
      return {
        ...layer,
        status:
          answer.kind === "skip_layer"
            ? ("skipped" as const)
            : ("complete" as const),
      };
    }
    if (layer.id === nxtLayer) {
      return { ...layer, status: "active" as const };
    }
    return layer;
  });

  const withLayers = { ...next, layers: completedCurrent, currentLayerId: nxtLayer };
  const newQuestion =
    options.nextQuestion && options.nextQuestion.layerId === nxtLayer
      ? options.nextQuestion
      : fallbackQuestionForLayer(nxtLayer, withLayers);
  return FirstPrinciplesSessionSchema.parse({
    ...withLayers,
    status: "layer_active",
    activeQuestion: newQuestion,
    pendingConflict: null,
    layers: completedCurrent.map((layer) =>
      layer.id === nxtLayer
        ? { ...layer, questions: [...layer.questions, newQuestion] }
        : layer,
    ),
  });
}

export function resolveFirstPrinciplesConflict(
  session: FirstPrinciplesSession,
  resolution: FirstPrinciplesConflictResolution,
  rephraseText?: string,
): FirstPrinciplesSession {
  if (session.status !== "conflict" || !session.pendingConflict) {
    throw new ProjectOSError(
      "plan_not_ready",
      "No pending conflict to resolve",
    );
  }
  const conflict = session.pendingConflict;
  let atomicClaims = [...session.atomicClaims];

  if (resolution === "keep_left") {
    atomicClaims = atomicClaims.map((claim) => {
      if (conflict.leftClaimId && claim.id === conflict.leftClaimId) {
        return { ...claim, status: "assumed" as const };
      }
      if (conflict.rightClaimId && claim.id === conflict.rightClaimId) {
        return { ...claim, status: "contested" as const };
      }
      return claim;
    });
  } else if (resolution === "keep_right") {
    atomicClaims = atomicClaims.map((claim) => {
      if (conflict.rightClaimId && claim.id === conflict.rightClaimId) {
        return { ...claim, status: "evidenced" as const };
      }
      if (conflict.leftClaimId && claim.id === conflict.leftClaimId) {
        return { ...claim, status: "contested" as const };
      }
      return claim;
    });
    if (!conflict.rightClaimId) {
      atomicClaims = [
        ...atomicClaims,
        {
          id: `claim_conflict_right_${conflict.id}`,
          text: conflict.rightLabel,
          status: "evidenced" as const,
          ...(conflict.evidenceRefs?.length
            ? { evidenceRefs: conflict.evidenceRefs }
            : {}),
        },
      ].slice(-24);
    }
  } else {
    const text = rephraseText?.trim() || conflict.summary;
    const rephrased: (typeof atomicClaims)[number] = {
      id: `claim_rephrase_${conflict.id}`,
      text,
      status: "assumed",
    };
    atomicClaims = [
      ...atomicClaims.filter(
        (claim) =>
          claim.id !== conflict.leftClaimId && claim.id !== conflict.rightClaimId,
      ),
      rephrased,
    ].slice(-24);
  }

  const question =
    session.activeQuestion ??
    fallbackQuestionForLayer(session.currentLayerId, {
      ...session,
      atomicClaims,
    });

  return FirstPrinciplesSessionSchema.parse({
    ...session,
    status: "layer_active",
    pendingConflict: null,
    atomicClaims,
    activeQuestion: question,
    layers: session.layers.map((layer) =>
      layer.id === session.currentLayerId
        ? {
            ...layer,
            status: "active" as const,
            questions: layer.questions.some((item) => item.id === question.id)
              ? layer.questions
              : [...layer.questions, question],
          }
        : layer,
    ),
    updatedAt: nowIso(),
  });
}

export function attachActiveQuestion(
  session: FirstPrinciplesSession,
  question: FirstPrinciplesQuestion,
): FirstPrinciplesSession {
  return FirstPrinciplesSessionSchema.parse({
    ...session,
    status: "layer_active",
    currentLayerId: question.layerId,
    activeQuestion: question,
    pendingConflict: null,
    layers: session.layers.map((layer) =>
      layer.id === question.layerId
        ? {
            ...layer,
            status: "active" as const,
            questions: layer.questions.some((item) => item.id === question.id)
              ? layer.questions
              : [...layer.questions, question],
          }
        : layer.id === session.currentLayerId && layer.id !== question.layerId
          ? layer
          : layer,
    ),
    updatedAt: nowIso(),
  });
}

export function confirmFirstPrinciplesThesis(
  session: FirstPrinciplesSession,
  thesis: FirstPrinciplesThesis,
  acknowledgeLowConfidence = false,
): FirstPrinciplesSession {
  if (session.status !== "thesis_review" && session.status !== "layer_active") {
    throw new ProjectOSError(
      "plan_not_ready",
      `Cannot confirm thesis in status ${session.status}`,
    );
  }
  if (thesis.verdict === "go" && thesis.confidence <= 2 && !acknowledgeLowConfidence) {
    throw new ProjectOSError(
      "acceptance_blocked",
      "Go with confidence ≤ 2 requires acknowledgeLowConfidence",
    );
  }
  const concludedAt = nowIso();
  return FirstPrinciplesSessionSchema.parse({
    ...session,
    status: "concluded",
    thesis,
    activeQuestion: null,
    updatedAt: concludedAt,
    concludedAt,
  });
}

export function buildHandoffPayload(
  session: FirstPrinciplesSession,
  target: FirstPrinciplesHandoffTarget,
): FirstPrinciplesHandoffPayload {
  if (session.status !== "concluded" || !session.thesis) {
    throw new ProjectOSError(
      "plan_not_ready",
      "Handoff requires a concluded thesis",
    );
  }
  if (target !== "ask_chat" && session.thesis.verdict !== "go") {
    throw new ProjectOSError(
      "acceptance_blocked",
      "Only go verdict can hand off to Plan/Agent",
    );
  }
  return {
    target,
    brief: buildHandoffBrief(session),
    clarifyingAnswers: collectClarifyingAnswers(session),
    session,
  };
}

export function diagramKindFromL4Answer(
  session: FirstPrinciplesSession,
): "causal" | "journey" | "boundary" | "decision" | "data_responsibility" | null {
  const l4 = session.layers.find((l) => l.id === "L4");
  const last = l4?.answers.at(-1);
  switch (last?.selectedOptionId) {
    case "l4_causal":
      return "causal";
    case "l4_journey":
      return "journey";
    case "l4_boundary":
      return "boundary";
    case "l4_decision":
      return "decision";
    case "l4_skip_diagram":
      return null;
    default:
      return last?.kind === "skip_layer" ? null : "causal";
  }
}

export function buildDiagramPrompt(
  session: FirstPrinciplesSession,
  kind: NonNullable<ReturnType<typeof diagramKindFromL4Answer>>,
): string {
  const t = session.thesis ?? buildThesisDraft(session);
  return [
    `Create a ${kind} diagram for a product thesis.`,
    `Vision: ${session.rawVision}`,
    `Problem: ${t.thesis}`,
    `For whom: ${t.forWhom}`,
    `MVP: ${t.mvp}`,
    `Non-goals: ${t.nonGoals.join("; ")}`,
    "Use clear boxes and arrows. Tech theme, high contrast, minimal decoration.",
  ].join("\n");
}
