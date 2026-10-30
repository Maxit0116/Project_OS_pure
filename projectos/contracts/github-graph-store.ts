import { z } from "zod";

import {
  GithubFeatureSchema,
  GithubRelationSchema,
} from "./github-domain.js";

/**
 * Persisted Project OS side of the GitHub Graph domain
 * (`.projectos/github-graph/features.json`).
 */
export const GithubGraphStoreDocumentSchema = z
  .object({
    version: z.literal("0.1.0").default("0.1.0"),
    features: z.array(GithubFeatureSchema).max(2_000).default([]),
    relations: z.array(GithubRelationSchema).max(20_000).default([]),
    updatedAt: z.string().min(1).max(64).optional(),
  })
  .strict();

export type GithubGraphStoreDocument = z.infer<
  typeof GithubGraphStoreDocumentSchema
>;

export const EMPTY_GITHUB_GRAPH_STORE: GithubGraphStoreDocument = {
  version: "0.1.0",
  features: [],
  relations: [],
};
