/**
 * Fixed retrieval checks (RAG-10). The score is not a user answer and
 * is not injected into a run prompt.
 */

export interface RetrievalEvalQuery {
  id: string;
  kind: "symbol" | "lexical" | "graph";
  query: string;
  expectedPath: string;
}

export const RETRIEVAL_EVAL_QUERIES: readonly RetrievalEvalQuery[] = [
  {
    id: "symbol-invoice",
    kind: "symbol",
    query: "InvoiceTotal",
    expectedPath: "src/billing.ts",
  },
  {
    id: "file-owned",
    kind: "lexical",
    query: "ownedMarker",
    expectedPath: "src/owned.ts",
  },
  {
    id: "graph-billing",
    kind: "graph",
    query: "node:billing",
    expectedPath: "src/owned.ts",
  },
];

export interface RetrievalEvalObservation {
  id: string;
  expectedPath: string;
  paths: readonly string[];
  omissionCount: number;
}

export interface RetrievalEvalScore {
  id: string;
  hit: boolean;
  omissionCount: number;
  /** Never a substitute for the user's question. */
  countsAsAnswer: false;
}

export function scoreRetrievalEval(
  observations: readonly RetrievalEvalObservation[],
): RetrievalEvalScore[] {
  return observations.map((observation) => ({
    id: observation.id,
    hit: observation.paths.includes(observation.expectedPath),
    omissionCount: observation.omissionCount,
    countsAsAnswer: false,
  }));
}
