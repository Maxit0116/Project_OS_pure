import { z } from "zod";

export const CODE_FILE_UNDERSTANDING_VERSION = "0.1.0" as const;

export const CodeFileUnderstandingEntrySchema = z
  .object({
    path: z.string().min(1).max(1_024),
    /** Detail-drawer description: who uses it, connections, boundaries. */
    description: z.string().trim().min(1).max(800),
    /** Detail-drawer Role: one ownership / responsibility sentence. */
    role: z.string().trim().min(1).max(400),
    contentHash: z.string().min(1).max(128),
    updatedAt: z.string().min(1),
    source: z.literal("llm"),
  })
  .strict();

export const CodeFileUnderstandingDocumentSchema = z
  .object({
    version: z.literal(CODE_FILE_UNDERSTANDING_VERSION),
    projectId: z.string().min(1),
    entries: z.array(CodeFileUnderstandingEntrySchema).max(10_000),
  })
  .strict();

export type CodeFileUnderstandingEntry = z.infer<
  typeof CodeFileUnderstandingEntrySchema
>;
export type CodeFileUnderstandingDocument = z.infer<
  typeof CodeFileUnderstandingDocumentSchema
>;

export function emptyCodeFileUnderstandingDocument(
  projectId: string,
): CodeFileUnderstandingDocument {
  return {
    version: CODE_FILE_UNDERSTANDING_VERSION,
    projectId,
    entries: [],
  };
}
