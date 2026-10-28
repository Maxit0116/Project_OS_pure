import {
  AgentRunSchema,
  type AgentRun,
} from "../contracts/agent-run.js";
import type { AgentRunEvent } from "../contracts/events.js";
import type {
  PromptRefineRequest,
  PromptRefinement,
} from "../contracts/prompt-refinement.js";
import { ProjectOSError } from "../errors.js";
import type { LoadedProjectOSWorkspace } from "../persistence/index.js";
import { cloneJson } from "../utils/json.js";
import type { DemoScenario } from "../validation/index.js";
import { ensureAlignmentOnRefinement } from "./alignment-contract.js";

export interface RegisteredScenarioRun {
  run: AgentRun;
  events: AgentRunEvent[];
  scenario: DemoScenario;
}

export class ScenarioRegistry {
  private readonly scenariosByRefinementId = new Map<string, DemoScenario>();
  private readonly scenariosByRunId = new Map<string, DemoScenario>();
  private readonly scenariosByHarnessErrorId = new Map<string, DemoScenario>();
  private readonly promptMatches: PromptScenarioMatch[] = [];

  constructor(workspace: LoadedProjectOSWorkspace) {
    for (const scenario of workspace.demoScenarios.values()) {
      if (scenario.refinement) {
        this.scenariosByRefinementId.set(scenario.refinement.id, scenario);
      }
      if (scenario.run) {
        this.scenariosByRunId.set(scenario.run.runId, scenario);
      }
      if (scenario.harnessErrorId) {
        this.scenariosByHarnessErrorId.set(scenario.harnessErrorId, scenario);
      }
      if (scenario.prompt && scenario.refinement) {
        this.promptMatches.push({
          nodeId: scenario.prompt.nodeId,
          rawPrompt: scenario.prompt.rawPrompt,
          scenario,
        });
      }
    }
  }

  findPromptRefinement(
    request: PromptRefineRequest,
  ): PromptRefinement | undefined {
    return this.findScenarioByPrompt(request)?.refinement;
  }

  createGenericRefinement(request: PromptRefineRequest): PromptRefinement {
    return createGenericPromptRefinement(request);
  }

  createRunForRefinement(refinementId: string): RegisteredScenarioRun {
    const scenario = this.scenariosByRefinementId.get(refinementId);
    if (!scenario || !scenario.run || !scenario.events) {
      throw new ProjectOSError(
        "refinement_not_found",
        `No executable demo scenario is registered for refinement '${refinementId}'`,
      );
    }

    return {
      run: toRunningAgentRun(scenario.run),
      events: cloneJson(scenario.events),
      scenario,
    };
  }

  hasExecutableRefinement(refinementId: string): boolean {
    const scenario = this.scenariosByRefinementId.get(refinementId);
    return Boolean(scenario?.run && scenario.events);
  }

  getScenarioForRun(runId: string): DemoScenario | undefined {
    return this.scenariosByRunId.get(runId);
  }

  getScenarioForHarnessError(errorId: string): DemoScenario | undefined {
    return this.scenariosByHarnessErrorId.get(errorId);
  }

  createRunForHarnessError(errorId: string): RegisteredScenarioRun {
    const scenario = this.scenariosByHarnessErrorId.get(errorId);
    if (!scenario || !scenario.run || !scenario.events) {
      throw new ProjectOSError(
        "harness_record_not_found",
        `No executable debug scenario is registered for harness error '${errorId}'`,
      );
    }

    return {
      run: toRunningAgentRun(scenario.run),
      events: cloneJson(scenario.events),
      scenario,
    };
  }

  private findScenarioByPrompt(
    request: PromptRefineRequest,
  ): DemoScenario | undefined {
    return this.promptMatches.find(
      (match) =>
        match.nodeId === request.nodeId && match.rawPrompt === request.rawPrompt,
    )?.scenario;
  }
}

export function createGenericPromptRefinement(
  request: PromptRefineRequest,
): PromptRefinement {
  const affectedNodeIds = request.nodeId ? [request.nodeId] : [];
  const affectedFiles = request.filePath ? [request.filePath] : [];
  const id = genericRefinementId(request);
  const base: PromptRefinement = {
    id,
    understood: request.rawPrompt,
    ambiguities: [],
    suggestions: [
      "No deterministic demo scenario matched this request.",
      "Use the current Project OS context to inspect linked files before execution.",
    ],
    affectedNodeIds,
    affectedFiles,
    confidence: 0.4,
    mode: "deterministic_fixture",
  };
  return ensureAlignmentOnRefinement(base, request.rawPrompt);
}
interface PromptScenarioMatch {
  nodeId: string | undefined;
  rawPrompt: string;
  scenario: DemoScenario;
}

function toRunningAgentRun(run: AgentRun): AgentRun {
  return AgentRunSchema.parse({
    runId: run.runId,
    projectId: run.projectId,
    kind: run.kind,
    status: "running",
    relatedNodeIds: [...run.relatedNodeIds],
    relatedFiles: [...run.relatedFiles],
    scope: run.scope,
    role: run.role,
    ...(run.parentRunId ? { parentRunId: run.parentRunId } : {}),
    ...(run.rootRunId ? { rootRunId: run.rootRunId } : {}),
    startedAt: run.startedAt,
  });
}

function genericRefinementId(request: PromptRefineRequest): string {
  const basis = `${request.projectId}:${request.nodeId ?? ""}:${
    request.filePath ?? ""
  }:${request.rawPrompt}`;
  let hash = 0;
  for (let index = 0; index < basis.length; index += 1) {
    hash = (hash * 31 + basis.charCodeAt(index)) >>> 0;
  }
  return `ref_generic_${hash.toString(16).padStart(8, "0")}`;
}
