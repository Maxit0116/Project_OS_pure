import { existsSync } from "node:fs";
import { join } from "node:path";

import { ProjectGraphSchema, type ProjectGraph } from "../contracts/graph.js";
import { ProjectOSError } from "../errors.js";
import {
  type FixtureValidationError,
  validateGraphReferences,
} from "./validate-fixtures.js";

export interface PersistableGraphOptions {
  /** When set, linkedFiles / fileIndex paths are checked under this root. */
  workspaceRoot?: string;
  /**
   * When true (default), skip on-disk file existence checks so AI scan results
   * are gated on topology (edges / node refs) rather than transient FS churn.
   */
  ignoreMissingFiles?: boolean;
}

/**
 * Topology + reference errors that would make loadWorkspace reject graph.json.
 * Used as a write-ahead gate for regenerate / refine / deepen.
 */
export function collectPersistableGraphErrors(
  graph: ProjectGraph,
  options: PersistableGraphOptions = {},
): FixtureValidationError[] {
  const ignoreMissingFiles = options.ignoreMissingFiles !== false;
  const fileExists = ignoreMissingFiles
    ? () => true
    : (relativePath: string) => {
        const root = options.workspaceRoot;
        if (!root) return true;
        return existsSync(join(root, relativePath));
      };

  const errors: FixtureValidationError[] = [];
  const parsed = ProjectGraphSchema.safeParse(graph);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      errors.push({
        code: "schema_invalid",
        artifact: "graph.json",
        path: issue.path.join("."),
        message: issue.message,
      });
    }
    return errors;
  }

  validateGraphReferences(parsed.data, fileExists, errors);
  return errors;
}

export function assertPersistableProjectGraph(
  graph: ProjectGraph,
  options: PersistableGraphOptions = {},
): void {
  const errors = collectPersistableGraphErrors(graph, options);
  if (errors.length === 0) return;

  const summary = errors
    .slice(0, 4)
    .map((error) => `${error.path || error.code}: ${error.message}`)
    .join("; ");
  throw new ProjectOSError(
    "agent_orchestration_failed",
    `Structure scan result is not persistable (${errors.length} issue${
      errors.length === 1 ? "" : "s"
    }): ${summary}`,
    { validationErrors: errors },
  );
}

/** Edge/schema issues that raw JSON pruning can often fix on open. */
export function isEdgeTopologyFixtureError(error: FixtureValidationError): boolean {
  if (error.artifact !== "graph.json") return false;
  return (
    error.code === "edge_self_loop" ||
    error.code === "edge_missing_node" ||
    error.code === "edge_duplicate_id" ||
    (error.code === "schema_invalid" &&
      (error.path.includes("source") ||
        error.path.includes("target") ||
        error.path.includes("edges")))
  );
}

/**
 * Historical agent-run JSONL is append-only telemetry. Schema evolution and
 * crash-truncated lines are recovered via soft parsing (corruptLines), so these
 * errors must not block opening an otherwise valid workspace.
 */
export function isAgentRunFixtureError(error: FixtureValidationError): boolean {
  return (
    error.artifact === "agent-runs" ||
    error.artifact.startsWith("agent-runs/")
  );
}

export function blockingWorkspaceOpenErrors(
  errors: FixtureValidationError[],
): FixtureValidationError[] {
  return errors.filter((error) => !isAgentRunFixtureError(error));
}
