import { z } from "zod";

/** A per-request choice. Defaults apply only when this field is absent. */
export const ExecutorSelectionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("model"), modelProfileId: z.string().trim().min(1) }).strict(),
  z.object({ kind: z.literal("runtime"), runtimeProfileId: z.string().trim().min(1) }).strict(),
]);

const ThinkingDepthSchema = z.enum(["off", "low", "medium", "high"]);

/**
 * Public run identity deliberately excludes credentials and endpoint configuration.
 * `model` runs use Project OS's own execution loop; `runtime` runs are dispatched
 * through a registered `NodeExecutorAdapter` that owns its loop.
 */
export const RunExecutorSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("model"),
    executorId: z.literal("projectos"),
    modelProfileId: z.string().min(1),
    label: z.string(),
    provider: z.string(),
    model: z.string(),
    thinkingDepth: ThinkingDepthSchema,
  }).strict(),
  z.object({
    kind: z.literal("runtime"),
    executorId: z.string().min(1),
    runtimeProfileId: z.string().min(1),
    label: z.string(),
    thinkingDepth: ThinkingDepthSchema,
  }).strict(),
]);

export type ExecutorSelection = z.infer<typeof ExecutorSelectionSchema>;
export type RunExecutor = z.infer<typeof RunExecutorSchema>;

/**
 * One registered agent runtime a request may choose, as the picker shows it.
 * `devOnly` runtimes are scripted stand-ins and must be labelled as such.
 */
export const ExecutorOptionSchema = z.object({
  kind: z.literal("runtime"),
  executorId: z.string().min(1),
  runtimeProfileId: z.string().min(1),
  label: z.string().min(1),
  devOnly: z.boolean(),
}).strict();

export type ExecutorOption = z.infer<typeof ExecutorOptionSchema>;
