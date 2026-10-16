import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

import {
  LOOP_GRAPH_VERSION,
  LoopAuthoringTurnRequestSchema,
  LoopGraphIndexSchema,
  createEmptyLoopDocument,
  headFromLoopDocument,
  normalizeLoopGraphDocument,
  pushIntentGraphHistory,
  summarizeGoalContextForGraphPrompt,
  type LoopAuthoringTurnRequest,
  type LoopGoalClarificationAnswer,
  type LoopGraphDocument,
  type LoopGraphHead,
  type LoopGraphIndex,
  type LoopSpec,
} from "../contracts/loop-graph.js";
import { validateLoopSpecTopology } from "../contracts/loop-graph.js";
import {
  applyLoopGoalClarificationHeuristic,
  authorLoopGoalContextHeuristic,
  buildCompleteTrace,
  buildRunningTrace,
  makeAuthoringMessage,
} from "./loop-goal-authoring-service.js";
import {
  buildCoarseLoopSkeletonFromGoal,
  editLoopGraphHeuristic,
} from "./loop-graph-edit-service.js";

const LOOP_GRAPHS_DIR = join(".projectos", "loop-graphs");
const INDEX_PATH = join(LOOP_GRAPHS_DIR, "index.json");

function documentFilePath(loopId: string): string {
  return join(LOOP_GRAPHS_DIR, `${loopId}.json`);
}

function ensureDir(workspaceRoot: string): string {
  const dir = join(workspaceRoot, LOOP_GRAPHS_DIR);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function readIndex(workspaceRoot: string): LoopGraphIndex {
  const indexPath = join(workspaceRoot, INDEX_PATH);
  if (!existsSync(indexPath)) {
    return { version: LOOP_GRAPH_VERSION, heads: [] };
  }
  try {
    return LoopGraphIndexSchema.parse(JSON.parse(readFileSync(indexPath, "utf8")));
  } catch {
    return { version: LOOP_GRAPH_VERSION, heads: [] };
  }
}

function writeIndex(workspaceRoot: string, index: LoopGraphIndex): void {
  ensureDir(workspaceRoot);
  const parsed = LoopGraphIndexSchema.parse(index);
  writeFileSync(join(workspaceRoot, INDEX_PATH), `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
}

function upsertHead(index: LoopGraphIndex, head: LoopGraphHead): LoopGraphIndex {
  const heads = index.heads.filter((item) => item.id !== head.id);
  return {
    ...index,
    heads: [head, ...heads].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
  };
}

export function listLoopGraphHeads(workspaceRoot: string): LoopGraphHead[] {
  return [...readIndex(workspaceRoot).heads].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );
}

export function getLoopGraphIndex(workspaceRoot: string): LoopGraphIndex {
  return readIndex(workspaceRoot);
}

export function getLoopGraph(
  workspaceRoot: string,
  loopId: string,
): LoopGraphDocument | null {
  const filePath = join(workspaceRoot, documentFilePath(loopId));
  if (!existsSync(filePath)) return null;
  try {
    return normalizeLoopGraphDocument(JSON.parse(readFileSync(filePath, "utf8")));
  } catch {
    return null;
  }
}

export function upsertLoopGraph(
  workspaceRoot: string,
  document: LoopGraphDocument,
): LoopGraphDocument {
  const parsed = normalizeLoopGraphDocument({
    ...document,
    updatedAt: new Date().toISOString(),
  });
  ensureDir(workspaceRoot);
  writeFileSync(
    join(workspaceRoot, documentFilePath(parsed.id)),
    `${JSON.stringify(parsed, null, 2)}\n`,
    "utf8",
  );
  let index = readIndex(workspaceRoot);
  index = upsertHead(index, headFromLoopDocument(parsed));
  if (!index.lastActiveId) {
    index = { ...index, lastActiveId: parsed.id };
  }
  writeIndex(workspaceRoot, index);
  return parsed;
}

export function createLoopGraph(
  workspaceRoot: string,
  projectId: string,
  title?: string,
): LoopGraphDocument {
  const doc = createEmptyLoopDocument({
    id: `loop_${randomUUID()}`,
    projectId,
    ...(title ? { title } : {}),
  });
  return upsertLoopGraph(workspaceRoot, doc);
}

export function deleteLoopGraph(workspaceRoot: string, loopId: string): boolean {
  const filePath = join(workspaceRoot, documentFilePath(loopId));
  if (!existsSync(filePath)) return false;
  unlinkSync(filePath);
  const index = readIndex(workspaceRoot);
  writeIndex(workspaceRoot, {
    ...index,
    heads: index.heads.filter((head) => head.id !== loopId),
    lastActiveId: index.lastActiveId === loopId ? undefined : index.lastActiveId,
  });
  return true;
}

export function setLastActiveLoopGraph(workspaceRoot: string, loopId: string): void {
  const index = readIndex(workspaceRoot);
  if (!index.heads.some((head) => head.id === loopId)) return;
  writeIndex(workspaceRoot, { ...index, lastActiveId: loopId });
}

export function linkLoopGraphToSession(
  workspaceRoot: string,
  loopId: string,
  sessionId: string,
): LoopGraphDocument | null {
  const doc = getLoopGraph(workspaceRoot, loopId);
  if (!doc) return null;
  if (doc.linkedSessionIds.includes(sessionId)) return doc;
  return upsertLoopGraph(workspaceRoot, {
    ...doc,
    linkedSessionIds: [...doc.linkedSessionIds, sessionId].slice(0, 20),
  });
}

export function unlinkLoopGraphFromSession(
  workspaceRoot: string,
  loopId: string,
  sessionId: string,
): LoopGraphDocument | null {
  const doc = getLoopGraph(workspaceRoot, loopId);
  if (!doc) return null;
  return upsertLoopGraph(workspaceRoot, {
    ...doc,
    linkedSessionIds: doc.linkedSessionIds.filter((id) => id !== sessionId),
  });
}

export function approveLoopSpec(
  workspaceRoot: string,
  loopId: string,
  spec: LoopSpec,
): LoopGraphDocument {
  const doc = getLoopGraph(workspaceRoot, loopId);
  if (!doc) {
    throw new Error(`Loop graph not found: ${loopId}`);
  }
  const issues = validateLoopSpecTopology(spec);
  if (issues.length > 0) {
    throw new Error(issues.map((issue) => issue.message).join("; "));
  }
  const next: LoopGraphDocument = {
    ...doc,
    approvedSpecs: [...doc.approvedSpecs, spec],
    pendingCompile: undefined,
  };
  return upsertLoopGraph(workspaceRoot, next);
}

export function savePendingCompile(
  workspaceRoot: string,
  loopId: string,
  pending: NonNullable<LoopGraphDocument["pendingCompile"]>,
): LoopGraphDocument {
  const doc = getLoopGraph(workspaceRoot, loopId);
  if (!doc) {
    throw new Error(`Loop graph not found: ${loopId}`);
  }
  return upsertLoopGraph(workspaceRoot, {
    ...doc,
    pendingCompile: pending,
  });
}

function requireLoop(workspaceRoot: string, loopId: string): LoopGraphDocument {
  const doc = getLoopGraph(workspaceRoot, loopId);
  if (!doc) {
    throw new Error(`Loop graph not found: ${loopId}`);
  }
  return doc;
}

export function setLoopComposerMode(
  workspaceRoot: string,
  loopId: string,
  mode: LoopAuthoringTurnRequest["mode"],
): LoopGraphDocument {
  const doc = requireLoop(workspaceRoot, loopId);
  return upsertLoopGraph(workspaceRoot, {
    ...doc,
    composerMode: mode,
  });
}

export function sendLoopAuthoringTurn(
  workspaceRoot: string,
  loopId: string,
  request: LoopAuthoringTurnRequest,
): LoopGraphDocument {
  const parsed = LoopAuthoringTurnRequestSchema.parse(request);
  const doc = requireLoop(workspaceRoot, loopId);
  const userMessage = makeAuthoringMessage("user", parsed.text);

  if (parsed.mode === "ask") {
    const unanswered = doc.draftGoalContext?.openQuestions.some((q) => !q.answer?.trim());
    if (unanswered) {
      throw new Error("Answer clarifying questions before sending another Ask turn");
    }
    const result = authorLoopGoalContextHeuristic({
      userText: parsed.text,
      threadLength: doc.authoringThread.length,
      ...(doc.draftGoalContext ? { prior: doc.draftGoalContext } : {}),
    });
    const assistant = makeAuthoringMessage("assistant", result.assistantMessage);
    return upsertLoopGraph(workspaceRoot, {
      ...doc,
      composerMode: "ask",
      authoringThread: [...doc.authoringThread, userMessage, assistant].slice(-200),
      draftGoalContext: result.draftGoalContext,
      authoringTrace: buildCompleteTrace(result.steps),
      pendingGraphEditOffer: undefined,
    });
  }

  const goalContext = doc.confirmedGoalContext ?? doc.draftGoalContext;
  const edit = editLoopGraphHeuristic({
    prompt: parsed.text,
    draft: doc.draft,
    ...(goalContext ? { goalContext } : {}),
  });
  const history = pushIntentGraphHistory(doc.draftHistory, {
    id: `hist_${randomUUID()}`,
    at: new Date().toISOString(),
    label: parsed.text.slice(0, 120),
    draft: doc.draft,
  });
  const assistant = makeAuthoringMessage("assistant", edit.summary);
  return upsertLoopGraph(workspaceRoot, {
    ...doc,
    composerMode: "edit",
    draft: edit.draft,
    draftHistory: history,
    authoringThread: [...doc.authoringThread, userMessage, assistant].slice(-200),
    authoringTrace: buildCompleteTrace(edit.steps),
  });
}

export function answerLoopGoalClarification(
  workspaceRoot: string,
  loopId: string,
  answers: LoopGoalClarificationAnswer[],
): LoopGraphDocument {
  const doc = requireLoop(workspaceRoot, loopId);
  if (!doc.draftGoalContext) {
    throw new Error("No draft goal context to clarify");
  }
  const result = applyLoopGoalClarificationHeuristic({
    draft: doc.draftGoalContext,
    answers,
    threadLength: doc.authoringThread.length,
  });
  const userSummary = answers.map((a) => a.answer).join("; ");
  const userMessage = makeAuthoringMessage("user", userSummary || "Clarification answers");
  const assistant = makeAuthoringMessage("assistant", result.assistantMessage);
  return upsertLoopGraph(workspaceRoot, {
    ...doc,
    draftGoalContext: result.draftGoalContext,
    authoringThread: [...doc.authoringThread, userMessage, assistant].slice(-200),
    authoringTrace: buildCompleteTrace(result.steps),
  });
}

export function confirmLoopGoalContext(
  workspaceRoot: string,
  loopId: string,
): LoopGraphDocument {
  const doc = requireLoop(workspaceRoot, loopId);
  if (!doc.draftGoalContext) {
    throw new Error("No draft goal context to confirm");
  }
  const unanswered = doc.draftGoalContext.openQuestions.some((q) => !q.answer?.trim());
  if (unanswered) {
    throw new Error("Answer clarifying questions before confirming goal context");
  }
  const confirmed = {
    ...doc.draftGoalContext,
    status: "confirmed" as const,
    updatedAt: new Date().toISOString(),
  };
  const graphPrompt = summarizeGoalContextForGraphPrompt(confirmed);
  return upsertLoopGraph(workspaceRoot, {
    ...doc,
    draftGoalContext: confirmed,
    confirmedGoalContext: confirmed,
    draft: {
      ...doc.draft,
      graphPrompt,
    },
    pendingGraphEditOffer: {
      reason: "Goal context confirmed. Generate a coarse draft graph?",
      createdAt: new Date().toISOString(),
    },
    authoringTrace: buildCompleteTrace([
      {
        id: `step_${randomUUID()}`,
        kind: "writing_context",
        label: "Goal context confirmed",
        at: new Date().toISOString(),
      },
    ]),
  });
}

export function acceptLoopGraphEditOffer(
  workspaceRoot: string,
  loopId: string,
): LoopGraphDocument {
  const doc = requireLoop(workspaceRoot, loopId);
  if (!doc.confirmedGoalContext) {
    throw new Error("Confirm a goal context before generating a graph");
  }
  if (!doc.pendingGraphEditOffer) {
    throw new Error("No pending graph edit offer");
  }
  const skeleton = buildCoarseLoopSkeletonFromGoal({
    context: doc.confirmedGoalContext,
    priorDraft: doc.draft,
  });
  const history = pushIntentGraphHistory(doc.draftHistory, {
    id: `hist_${randomUUID()}`,
    at: new Date().toISOString(),
    label: "Before skeleton from goal context",
    draft: doc.draft,
  });
  const assistant = makeAuthoringMessage("assistant", skeleton.summary);
  return upsertLoopGraph(workspaceRoot, {
    ...doc,
    draft: skeleton.draft,
    draftHistory: history,
    pendingGraphEditOffer: undefined,
    authoringThread: [...doc.authoringThread, assistant].slice(-200),
    authoringTrace: buildCompleteTrace(skeleton.steps),
  });
}

export function dismissLoopGraphEditOffer(
  workspaceRoot: string,
  loopId: string,
): LoopGraphDocument {
  const doc = requireLoop(workspaceRoot, loopId);
  return upsertLoopGraph(workspaceRoot, {
    ...doc,
    pendingGraphEditOffer: undefined,
  });
}

export function undoLoopDraft(
  workspaceRoot: string,
  loopId: string,
): LoopGraphDocument {
  const doc = requireLoop(workspaceRoot, loopId);
  if (doc.draftHistory.length === 0) {
    throw new Error("Nothing to undo");
  }
  const previous = doc.draftHistory[doc.draftHistory.length - 1]!;
  const remaining = doc.draftHistory.slice(0, -1);
  return upsertLoopGraph(workspaceRoot, {
    ...doc,
    draft: previous.draft,
    draftHistory: remaining,
    authoringTrace: buildCompleteTrace([
      {
        id: `step_${randomUUID()}`,
        kind: "applying_patch",
        label: `Undid: ${previous.label}`,
        at: new Date().toISOString(),
      },
    ]),
  });
}

/** Mark authoring as running (optional UI hint before async LLM; stubs complete synchronously). */
export function markLoopAuthoringRunning(
  workspaceRoot: string,
  loopId: string,
  label = "Working…",
): LoopGraphDocument {
  const doc = requireLoop(workspaceRoot, loopId);
  return upsertLoopGraph(workspaceRoot, {
    ...doc,
    authoringTrace: buildRunningTrace([
      {
        id: `step_${randomUUID()}`,
        kind: "thinking",
        label,
        at: new Date().toISOString(),
      },
    ]),
  });
}
