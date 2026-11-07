import { randomUUID } from "node:crypto";

import {
  LOOP_GRAPH_VERSION,
  LoopAuthoringTurnRequestSchema,
  createEmptyLoopDocument,
  emptyAuthoringTrace,
  getIntentGraphCompileIssues,
  headFromLoopDocument,
  isIntentGraphReadyForCompile,
  normalizeLoopGraphDocument,
  pushIntentGraphHistory,
  summarizeGoalContextForGraphPrompt,
  trimLoopInstanceEvents,
  validateLoopSpecTopology,
  type LoopAuthoringTurnRequest,
  type LoopCompileResult,
  type LoopComposerMode,
  type LoopGoalClarificationAnswer,
  type LoopGraphDocument,
  type LoopGraphHead,
  type LoopGraphIndex,
  type LoopHitlAnswer,
  type LoopInstance,
  type LoopInstanceEvent,
  type LoopSpec,
} from "../contracts/loop-graph.js";
import {
  LOOP_FILES_NOT_ATTACHED,
  LOOP_VERIFICATION_NOT_RUN,
} from "../services/loop-execution.js";
import { compileIntentGraphHeuristic } from "../services/loop-graph-compiler.js";
import {
  applyLoopGoalClarificationHeuristic,
  authorLoopGoalContextHeuristic,
  buildCompleteTrace,
  makeAuthoringMessage,
} from "../services/loop-goal-authoring-service.js";
import {
  buildCoarseLoopSkeletonFromGoal,
  editLoopGraphHeuristic,
} from "../services/loop-graph-edit-service.js";
import { cloneJson } from "../utils/json.js";

interface ProjectLoops {
  index: LoopGraphIndex;
  documents: Map<string, LoopGraphDocument>;
}

const loopsByProject = new Map<string, ProjectLoops>();

function getStore(projectId: string): ProjectLoops {
  let store = loopsByProject.get(projectId);
  if (!store) {
    store = {
      index: { version: LOOP_GRAPH_VERSION, heads: [] },
      documents: new Map(),
    };
    loopsByProject.set(projectId, store);
  }
  return store;
}

function upsertHead(store: ProjectLoops, doc: LoopGraphDocument): void {
  const head = headFromLoopDocument(doc);
  store.index = {
    ...store.index,
    heads: [head, ...store.index.heads.filter((item) => item.id !== head.id)].sort(
      (a, b) => b.updatedAt.localeCompare(a.updatedAt),
    ),
    lastActiveId: store.index.lastActiveId ?? head.id,
  };
}

export function mockResetLoopGraphs(): void {
  loopsByProject.clear();
}

export function mockListLoopGraphs(projectId: string): LoopGraphHead[] {
  return [...getStore(projectId).index.heads].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );
}

export function mockGetLoopGraphIndex(projectId: string): LoopGraphIndex {
  return cloneJson(getStore(projectId).index);
}

export function mockGetLoopGraph(
  projectId: string,
  loopId: string,
): LoopGraphDocument | null {
  const doc = getStore(projectId).documents.get(loopId);
  return doc ? cloneJson(doc) : null;
}

export function mockUpsertLoopGraph(
  projectId: string,
  document: LoopGraphDocument,
): LoopGraphDocument {
  const store = getStore(projectId);
  const parsed = normalizeLoopGraphDocument({
    ...document,
    projectId,
    updatedAt: new Date().toISOString(),
  });
  store.documents.set(parsed.id, cloneJson(parsed));
  upsertHead(store, parsed);
  return cloneJson(parsed);
}

export function mockCreateLoopGraph(
  projectId: string,
  title?: string,
): LoopGraphDocument {
  const doc = createEmptyLoopDocument({
    id: `loop_${randomUUID()}`,
    projectId,
    ...(title ? { title } : {}),
  });
  return mockUpsertLoopGraph(projectId, doc);
}

export function mockDeleteLoopGraph(projectId: string, loopId: string): boolean {
  const store = getStore(projectId);
  if (!store.documents.has(loopId)) return false;
  store.documents.delete(loopId);
  store.index = {
    ...store.index,
    heads: store.index.heads.filter((head) => head.id !== loopId),
    lastActiveId:
      store.index.lastActiveId === loopId ? undefined : store.index.lastActiveId,
  };
  return true;
}

export function mockSetLastActiveLoopGraph(projectId: string, loopId: string): void {
  const store = getStore(projectId);
  if (!store.documents.has(loopId)) return;
  store.index = { ...store.index, lastActiveId: loopId };
}

export function mockLinkLoopGraphToSession(
  projectId: string,
  loopId: string,
  sessionId: string,
): LoopGraphDocument | null {
  const doc = mockGetLoopGraph(projectId, loopId);
  if (!doc) return null;
  if (doc.linkedSessionIds.includes(sessionId)) return doc;
  return mockUpsertLoopGraph(projectId, {
    ...doc,
    linkedSessionIds: [...doc.linkedSessionIds, sessionId].slice(0, 20),
  });
}

export function mockUnlinkLoopGraphFromSession(
  projectId: string,
  loopId: string,
  sessionId: string,
): LoopGraphDocument | null {
  const doc = mockGetLoopGraph(projectId, loopId);
  if (!doc) return null;
  return mockUpsertLoopGraph(projectId, {
    ...doc,
    linkedSessionIds: doc.linkedSessionIds.filter((id) => id !== sessionId),
  });
}

export function mockCompileLoopGraph(
  projectId: string,
  loopId: string,
): LoopCompileResult {
  const doc = mockGetLoopGraph(projectId, loopId);
  if (!doc) throw new Error(`Loop graph not found: ${loopId}`);
  if (!isIntentGraphReadyForCompile(doc.draft)) {
    const issues = getIntentGraphCompileIssues(doc.draft);
    throw new Error(issues[0]?.message ?? "Loop graph is not ready to interpret");
  }
  const result = compileIntentGraphHeuristic(doc.draft);
  mockUpsertLoopGraph(projectId, {
    ...doc,
    pendingCompile: {
      ...result,
      compiledAt: new Date().toISOString(),
    },
  });
  return result;
}

export function mockApproveLoopSpec(
  projectId: string,
  loopId: string,
  spec: LoopSpec,
): LoopGraphDocument {
  const doc = mockGetLoopGraph(projectId, loopId);
  if (!doc) throw new Error(`Loop graph not found: ${loopId}`);
  const issues = validateLoopSpecTopology(spec);
  if (issues.length > 0) {
    throw new Error(issues.map((issue) => issue.message).join("; "));
  }
  return mockUpsertLoopGraph(projectId, {
    ...doc,
    approvedSpecs: [...doc.approvedSpecs, spec],
    pendingCompile: undefined,
  });
}

function pushEvent(
  instance: LoopInstance,
  type: LoopInstanceEvent["type"],
  message?: string,
  nodeId?: string,
): LoopInstance {
  const at = new Date().toISOString();
  return {
    ...instance,
    events: trimLoopInstanceEvents([
      ...instance.events,
      { id: `evt_${randomUUID()}`, at, type, message, nodeId },
    ]),
    updatedAt: at,
  };
}

function entryNodeId(spec: LoopSpec): string {
  const incoming = new Set(
    spec.edges.filter((edge) => edge.kind === "depends").map((edge) => edge.to),
  );
  return spec.nodes.find((node) => !incoming.has(node.id))?.id ?? spec.nodes[0]!.id;
}

function mockStep(doc: LoopGraphDocument, instanceId: string): LoopGraphDocument {
  const instance = doc.instances.find((item) => item.id === instanceId);
  if (!instance) return doc;
  if (instance.status !== "running" && instance.status !== "queued") return doc;
  const spec = doc.approvedSpecs.find((item) => item.version === instance.specVersion);
  if (!spec) return doc;

  let next =
    instance.status === "queued"
      ? pushEvent({ ...instance, status: "running" }, "started")
      : instance;
  const cursor = next.cursorNodeId ?? entryNodeId(spec);
  const node = spec.nodes.find((item) => item.id === cursor);
  if (!node) {
    next = pushEvent(
      { ...next, status: "error", completedAt: new Date().toISOString() },
      "errored",
      `Missing node ${cursor}`,
    );
    return {
      ...doc,
      instances: doc.instances.map((item) => (item.id === instanceId ? next : item)),
    };
  }

  next = pushEvent({ ...next, cursorNodeId: cursor }, "node_entered", node.goal, cursor);

  if (node.role === "decide") {
    next = pushEvent(
      { ...next, status: "awaiting_hitl", hitlQuestionIds: [`decide_${node.id}`] },
      "awaiting_hitl",
      "Decision required",
      cursor,
    );
  } else if (node.role === "verify") {
    next = pushEvent(
      { ...next, status: "awaiting_hitl", hitlQuestionIds: ["verification_not_run"] },
      "awaiting_hitl",
      LOOP_VERIFICATION_NOT_RUN,
      cursor,
    );
  } else if (node.role === "implement" || node.role === "fix") {
    next = pushEvent(
      {
        ...next,
        status: "error",
        errorMessage: LOOP_FILES_NOT_ATTACHED,
        completedAt: new Date().toISOString(),
      },
      "node_failed",
      LOOP_FILES_NOT_ATTACHED,
      cursor,
    );
  } else {
    next = pushEvent(
      {
        ...next,
        status: "error",
        errorMessage: `Unsupported loop role ${node.role}`,
        completedAt: new Date().toISOString(),
      },
      "node_failed",
      `Unsupported loop role ${node.role}`,
      cursor,
    );
  }

  return {
    ...doc,
    instances: doc.instances.map((item) => (item.id === instanceId ? next : item)),
  };
}

export function mockStartLoopInstance(
  projectId: string,
  loopId: string,
  specVersion?: string,
): LoopGraphDocument {
  const doc = mockGetLoopGraph(projectId, loopId);
  if (!doc) throw new Error(`Loop graph not found: ${loopId}`);
  const spec =
    (specVersion
      ? doc.approvedSpecs.find((item) => item.version === specVersion)
      : doc.approvedSpecs[doc.approvedSpecs.length - 1]) ?? undefined;
  if (!spec) throw new Error("No approved Loop Spec to run");
  const issues = validateLoopSpecTopology(spec);
  if (issues.length > 0) throw new Error(issues.map((i) => i.message).join("; "));

  const startedAt = new Date().toISOString();
  const instance: LoopInstance = {
    id: `inst_${randomUUID()}`,
    specVersion: spec.version,
    status: "queued",
    cursorNodeId: entryNodeId(spec),
    round: 0,
    attemptCounts: {},
    events: [],
    startedAt,
    updatedAt: startedAt,
  };
  return mockUpsertLoopGraph(
    projectId,
    mockStep({ ...doc, instances: [...doc.instances, instance] }, instance.id),
  );
}

export function mockPauseLoopInstance(
  projectId: string,
  loopId: string,
  instanceId: string,
): LoopGraphDocument {
  const doc = mockGetLoopGraph(projectId, loopId);
  if (!doc) throw new Error(`Loop graph not found: ${loopId}`);
  const instance = doc.instances.find((item) => item.id === instanceId);
  if (!instance) throw new Error(`Instance not found: ${instanceId}`);
  if (instance.status !== "running" && instance.status !== "queued") return doc;
  const next = pushEvent({ ...instance, status: "paused" }, "paused", "Paused by user");
  return mockUpsertLoopGraph(projectId, {
    ...doc,
    instances: doc.instances.map((item) => (item.id === instanceId ? next : item)),
  });
}

export function mockResumeLoopInstance(
  projectId: string,
  loopId: string,
  instanceId: string,
): LoopGraphDocument {
  const doc = mockGetLoopGraph(projectId, loopId);
  if (!doc) throw new Error(`Loop graph not found: ${loopId}`);
  const instance = doc.instances.find((item) => item.id === instanceId);
  if (!instance || instance.status !== "paused") return doc ?? mockGetLoopGraph(projectId, loopId)!;
  const next = pushEvent({ ...instance, status: "running" }, "resumed", "Resumed by user");
  return mockUpsertLoopGraph(
    projectId,
    mockStep(
      {
        ...doc,
        instances: doc.instances.map((item) => (item.id === instanceId ? next : item)),
      },
      instanceId,
    ),
  );
}

export function mockResolveLoopHitl(
  projectId: string,
  loopId: string,
  instanceId: string,
  answers: LoopHitlAnswer[],
): LoopGraphDocument {
  const doc = mockGetLoopGraph(projectId, loopId);
  if (!doc) throw new Error(`Loop graph not found: ${loopId}`);
  const instance = doc.instances.find((item) => item.id === instanceId);
  if (!instance || instance.status !== "awaiting_hitl") return doc;
  const summary = answers.map((a) => `${a.questionId}=${a.answer}`).join("; ");
  const next = pushEvent(
    { ...instance, status: "running", hitlQuestionIds: [] },
    "hitl_resolved",
    summary || "HITL resolved",
  );
  return mockUpsertLoopGraph(
    projectId,
    mockStep(
      {
        ...doc,
        instances: doc.instances.map((item) => (item.id === instanceId ? next : item)),
      },
      instanceId,
    ),
  );
}

export function mockGetLoopInstanceEvents(
  projectId: string,
  loopId: string,
  instanceId: string,
): LoopInstanceEvent[] {
  const doc = mockGetLoopGraph(projectId, loopId);
  return doc?.instances.find((item) => item.id === instanceId)?.events ?? [];
}

export function mockAdvanceLoopInstance(
  projectId: string,
  loopId: string,
  instanceId: string,
): LoopGraphDocument {
  const doc = mockGetLoopGraph(projectId, loopId);
  if (!doc) throw new Error(`Loop graph not found: ${loopId}`);
  return mockUpsertLoopGraph(projectId, mockStep(doc, instanceId));
}

function mockRequireLoop(projectId: string, loopId: string): LoopGraphDocument {
  const doc = mockGetLoopGraph(projectId, loopId);
  if (!doc) throw new Error(`Loop graph not found: ${loopId}`);
  return doc;
}

export function mockSetLoopComposerMode(
  projectId: string,
  loopId: string,
  mode: LoopComposerMode,
): LoopGraphDocument {
  const doc = mockRequireLoop(projectId, loopId);
  return mockUpsertLoopGraph(projectId, { ...doc, composerMode: mode });
}

export function mockSendLoopAuthoringTurn(
  projectId: string,
  loopId: string,
  request: LoopAuthoringTurnRequest,
): LoopGraphDocument {
  const parsed = LoopAuthoringTurnRequestSchema.parse(request);
  const doc = mockRequireLoop(projectId, loopId);
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
    return mockUpsertLoopGraph(projectId, {
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
  return mockUpsertLoopGraph(projectId, {
    ...doc,
    composerMode: "edit",
    draft: edit.draft,
    draftHistory: history,
    authoringThread: [...doc.authoringThread, userMessage, assistant].slice(-200),
    authoringTrace: buildCompleteTrace(edit.steps),
  });
}

export function mockAnswerLoopGoalClarification(
  projectId: string,
  loopId: string,
  answers: LoopGoalClarificationAnswer[],
): LoopGraphDocument {
  const doc = mockRequireLoop(projectId, loopId);
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
  return mockUpsertLoopGraph(projectId, {
    ...doc,
    draftGoalContext: result.draftGoalContext,
    authoringThread: [...doc.authoringThread, userMessage, assistant].slice(-200),
    authoringTrace: buildCompleteTrace(result.steps),
  });
}

export function mockCancelLoopGoalClarification(
  projectId: string,
  loopId: string,
): LoopGraphDocument {
  const doc = mockRequireLoop(projectId, loopId);
  if (!doc.draftGoalContext) {
    throw new Error("No draft goal context to cancel");
  }
  const unanswered = doc.draftGoalContext.openQuestions.some((q) => !q.answer?.trim());
  if (!unanswered) {
    throw new Error("No pending clarifying questions to cancel");
  }

  let thread = doc.authoringThread;
  if (
    thread.length >= 2 &&
    thread[thread.length - 1]?.role === "assistant" &&
    thread[thread.length - 2]?.role === "user"
  ) {
    thread = thread.slice(0, -2);
  }

  const { draftGoalContext: _removed, ...rest } = doc;
  return mockUpsertLoopGraph(projectId, {
    ...rest,
    authoringThread: thread,
    authoringTrace: emptyAuthoringTrace(),
  });
}

export function mockConfirmLoopGoalContext(
  projectId: string,
  loopId: string,
): LoopGraphDocument {
  const doc = mockRequireLoop(projectId, loopId);
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
  return mockUpsertLoopGraph(projectId, {
    ...doc,
    draftGoalContext: confirmed,
    confirmedGoalContext: confirmed,
    draft: {
      ...doc.draft,
      graphPrompt: summarizeGoalContextForGraphPrompt(confirmed),
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

export function mockAcceptLoopGraphEditOffer(
  projectId: string,
  loopId: string,
): LoopGraphDocument {
  const doc = mockRequireLoop(projectId, loopId);
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
  return mockUpsertLoopGraph(projectId, {
    ...doc,
    draft: skeleton.draft,
    draftHistory: history,
    pendingGraphEditOffer: undefined,
    authoringThread: [...doc.authoringThread, assistant].slice(-200),
    authoringTrace: buildCompleteTrace(skeleton.steps),
  });
}

export function mockDismissLoopGraphEditOffer(
  projectId: string,
  loopId: string,
): LoopGraphDocument {
  const doc = mockRequireLoop(projectId, loopId);
  return mockUpsertLoopGraph(projectId, {
    ...doc,
    pendingGraphEditOffer: undefined,
  });
}

export function mockUndoLoopDraft(
  projectId: string,
  loopId: string,
): LoopGraphDocument {
  const doc = mockRequireLoop(projectId, loopId);
  if (doc.draftHistory.length === 0) {
    throw new Error("Nothing to undo");
  }
  const previous = doc.draftHistory[doc.draftHistory.length - 1]!;
  return mockUpsertLoopGraph(projectId, {
    ...doc,
    draft: previous.draft,
    draftHistory: doc.draftHistory.slice(0, -1),
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
