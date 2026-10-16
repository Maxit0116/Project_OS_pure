import { randomUUID } from "node:crypto";

import type {
  IntentGraph,
  IntentGraphEdge,
  IntentGraphNode,
  LoopAuthoringTraceStep,
  LoopGoalContext,
} from "../contracts/loop-graph.js";
import { emptyIntentGraph } from "../contracts/loop-graph.js";

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

function nodeId(): string {
  return `node_${randomUUID().slice(0, 8)}`;
}

function edgeId(): string {
  return `edge_${randomUUID().slice(0, 8)}`;
}

function cloneDraft(draft: IntentGraph): IntentGraph {
  return {
    revision: draft.revision,
    graphPrompt: draft.graphPrompt,
    nodes: draft.nodes.map((node) => ({ ...node, position: { ...node.position } })),
    edges: draft.edges.map((edge) => ({ ...edge })),
  };
}

/** Coarse skeleton from a confirmed goal context (implement → verify). */
export function buildCoarseLoopSkeletonFromGoal(input: {
  context: LoopGoalContext;
  priorDraft?: IntentGraph | null;
}): {
  draft: IntentGraph;
  steps: LoopAuthoringTraceStep[];
  summary: string;
} {
  const steps = [
    step("proposing_graph", "Proposing a coarse loop skeleton"),
    step("applying_patch", "Applying skeleton to the draft graph"),
  ];
  const implementId = nodeId();
  const verifyId = nodeId();
  const goal = input.context.goal.slice(0, 120);
  const nodes: IntentGraphNode[] = [
    {
      id: implementId,
      title: "Implement",
      prompt: `Implement: ${input.context.goal}`.slice(0, 4000),
      role: "implement",
      position: { x: 80, y: 120 },
    },
    {
      id: verifyId,
      title: "Verify",
      prompt: (
        input.context.doneWhen[0]
          ? `Verify: ${input.context.doneWhen[0]}`
          : `Verify that “${goal}” is done`
      ).slice(0, 4000),
      role: "verify",
      position: { x: 320, y: 120 },
    },
  ];
  const edges: IntentGraphEdge[] = [
    {
      id: edgeId(),
      source: implementId,
      target: verifyId,
      kind: "depends",
      prompt: "After implementation, verify acceptance",
    },
  ];

  const graphPromptParts = [input.context.goal];
  if (input.context.constraints.length > 0) {
    graphPromptParts.push(`Constraints: ${input.context.constraints.join("; ")}`);
  }

  const draft: IntentGraph = {
    revision: (input.priorDraft?.revision ?? 0) + 1,
    graphPrompt: graphPromptParts.join("\n").slice(0, 4000),
    nodes,
    edges,
  };

  return {
    draft,
    steps,
    summary: `Created a coarse 2-node skeleton for “${goal}”. Refine nodes on the canvas or switch to Edit mode.`,
  };
}

/** Deterministic Edit stub: keyword-driven coarse IntentGraph mutations. */
export function editLoopGraphHeuristic(input: {
  prompt: string;
  draft: IntentGraph;
  goalContext?: LoopGoalContext;
}): {
  draft: IntentGraph;
  steps: LoopAuthoringTraceStep[];
  summary: string;
} {
  const steps = [
    step("thinking", "Interpreting graph edit request"),
    step("proposing_graph", "Proposing graph changes"),
    step("applying_patch", "Applying draft patch"),
  ];

  const text = input.prompt.trim();
  const next = cloneDraft(input.draft);
  const lower = text.toLowerCase();

  if (next.nodes.length === 0 && /skeleton|start|create|生成|创建/.test(lower)) {
    const fromGoal = buildCoarseLoopSkeletonFromGoal({
      context: input.goalContext ?? {
        goal: text.slice(0, 1000) || "Untitled goal",
        constraints: [],
        doneWhen: [],
        outOfScope: [],
        openQuestions: [],
        status: "draft",
        revision: 1,
        updatedAt: nowIso(),
        sourceThreadLength: 1,
      },
      priorDraft: next,
    });
    return {
      draft: fromGoal.draft,
      steps: [...steps, ...fromGoal.steps],
      summary: fromGoal.summary,
    };
  }

  if (/add\s+verify|加.*验证|增加.*verify/i.test(text)) {
    const source = next.nodes[next.nodes.length - 1];
    const id = nodeId();
    next.nodes.push({
      id,
      title: "Verify",
      prompt: "Verify the previous step",
      role: "verify",
      position: {
        x: (source?.position.x ?? 80) + 240,
        y: source?.position.y ?? 120,
      },
    });
    if (source) {
      next.edges.push({
        id: edgeId(),
        source: source.id,
        target: id,
        kind: "depends",
        prompt: "Then verify",
      });
    }
    next.revision += 1;
    return {
      draft: next,
      steps,
      summary: "Added a verify node and depends edge.",
    };
  }

  if (/add\s+fix|加.*修复|增加.*fix/i.test(text)) {
    const id = nodeId();
    const anchor =
      next.nodes.find((n) => n.role === "verify") ?? next.nodes[next.nodes.length - 1];
    next.nodes.push({
      id,
      title: "Fix",
      prompt: "Fix failures from verification",
      role: "fix",
      position: {
        x: (anchor?.position.x ?? 80) - 40,
        y: (anchor?.position.y ?? 120) + 140,
      },
    });
    if (anchor) {
      next.edges.push({
        id: edgeId(),
        source: anchor.id,
        target: id,
        kind: "feedback",
        prompt: "On failure, fix and retry",
      });
    }
    next.revision += 1;
    return {
      draft: next,
      steps,
      summary: "Added a fix node with a feedback edge.",
    };
  }

  if (/clear|reset|清空|重置/i.test(text)) {
    const cleared = emptyIntentGraph(next.revision + 1);
    cleared.graphPrompt = next.graphPrompt;
    return {
      draft: cleared,
      steps,
      summary: "Cleared all nodes and edges from the draft graph.",
    };
  }

  if (/rename\s+goal|改.*目标|set\s+goal/i.test(text)) {
    const goal = text.replace(/^(?:rename\s+goal|改.*目标|set\s+goal)[:：]?\s*/i, "").trim();
    if (goal) {
      next.graphPrompt = goal.slice(0, 4000);
      next.revision += 1;
      return {
        draft: next,
        steps,
        summary: `Updated graph-level goal text to “${goal.slice(0, 80)}”.`,
      };
    }
  }

  // Default: ensure at least implement→verify if empty; otherwise append an implement node.
  if (next.nodes.length === 0) {
    const fromGoal = buildCoarseLoopSkeletonFromGoal({
      context: {
        goal: text.slice(0, 1000) || input.goalContext?.goal || "Untitled goal",
        constraints: input.goalContext?.constraints ?? [],
        doneWhen: input.goalContext?.doneWhen ?? [],
        outOfScope: input.goalContext?.outOfScope ?? [],
        openQuestions: [],
        status: "draft",
        revision: 1,
        updatedAt: nowIso(),
        sourceThreadLength: 1,
      },
      priorDraft: next,
    });
    return {
      draft: fromGoal.draft,
      steps,
      summary: fromGoal.summary,
    };
  }

  const last = next.nodes[next.nodes.length - 1]!;
  const id = nodeId();
  next.nodes.push({
    id,
    title: text.slice(0, 40) || "Task",
    prompt: text.slice(0, 4000),
    role: "implement",
    position: { x: last.position.x + 240, y: last.position.y },
  });
  next.edges.push({
    id: edgeId(),
    source: last.id,
    target: id,
    kind: "depends",
    prompt: "Continue to next task",
  });
  next.revision += 1;
  return {
    draft: next,
    steps,
    summary: `Appended a task node from your edit prompt.`,
  };
}
