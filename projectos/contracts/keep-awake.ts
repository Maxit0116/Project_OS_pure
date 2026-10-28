import { z } from "zod";

/** When Project OS should keep the Mac from sleeping (incl. lid close on darwin). */
export const KeepAwakeModeSchema = z.enum([
  "off",
  "while_agents_running",
  "while_app_open",
]);

export type KeepAwakeMode = z.infer<typeof KeepAwakeModeSchema>;

export const KeepAwakeStatusSchema = z
  .object({
    /** macOS desktop only; false on other platforms / non-desktop. */
    supported: z.boolean(),
    mode: KeepAwakeModeSchema,
    /** True when keep-awake is currently applying (idle and/or lid). */
    active: z.boolean(),
    idleBlocked: z.boolean(),
    /** Lid-close guard currently held via pmset disablesleep. */
    lidGuardActive: z.boolean(),
    /** Lid guard is attempted on darwin; other platforms skip it. */
    lidGuardSupported: z.boolean(),
    agentActivity: z.boolean(),
    lastError: z.string().optional(),
  })
  .strict();

export type KeepAwakeStatus = z.infer<typeof KeepAwakeStatusSchema>;

export function parseKeepAwakeMode(value: unknown): KeepAwakeMode {
  const parsed = KeepAwakeModeSchema.safeParse(value);
  return parsed.success ? parsed.data : "off";
}

/** Renderer → main: treat these signals as “an agent is working”. */
export function shouldReportAgentActivity(input: {
  flowStatus: string;
  refineLoading: boolean;
  askTraceStatus?: string | null;
  planTraceStatus?: string | null;
}): boolean {
  if (input.flowStatus === "running") return true;
  if (input.refineLoading) return true;
  if (input.askTraceStatus === "running") return true;
  if (input.planTraceStatus === "running") return true;
  return false;
}
