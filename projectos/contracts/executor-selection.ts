import { z } from "zod";

/** A per-request choice. Defaults apply only when this field is absent. */
export const ExecutorSelectionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("model"), modelProfileId: z.string().trim().min(1) }).strict(),
  z.object({ kind: z.literal("runtime"), runtimeProfileId: z.string().trim().min(1) }).strict(),
]);

/** Public run identity deliberately excludes credentials and endpoint configuration. */
export const RunExecutorSchema = z.object({
  kind: z.literal("model"),
  executorId: z.literal("projectos"),
  modelProfileId: z.string().min(1),
  label: z.string(),
  provider: z.string(),
  model: z.string(),
  thinkingDepth: z.enum(["off", "low", "medium", "high"]),
}).strict();

export type ExecutorSelection = z.infer<typeof ExecutorSelectionSchema>;
export type RunExecutor = z.infer<typeof RunExecutorSchema>;
