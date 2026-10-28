import type {
  PinComposerHub,
  PinComposerHubSubagentLink,
} from "../contracts/spatial-pin.js";

export interface ComposeSubagentAskResult {
  slotId: string;
  name: string;
  ok: boolean;
  summary: string;
  runId?: string;
}

export interface SpawnComposeSubagentsDeps {
  ask: (input: {
    slotId: string;
    name: string;
    question: string;
  }) => Promise<{ answer: string; runId?: string }>;
}

/** Build the per-slot prompt shared with parent hub context. */
export function buildComposeSubagentQuestion(input: {
  slotName: string;
  slotBrief: string;
  parentPrompt: string;
  hub: PinComposerHub;
}): string {
  const contextLines: string[] = [
    `You are subagent "${input.slotName}" working as part of a spatial compose hub.`,
  ];
  if (input.slotBrief.trim()) {
    contextLines.push(`Your brief:\n${input.slotBrief.trim()}`);
  }
  if (input.hub.repo) {
    contextLines.push(
      `Repository: ${input.hub.repo.label}${input.hub.repo.branch ? ` @ ${input.hub.repo.branch}` : ""}`,
    );
  }
  if (input.hub.folders.length > 0) {
    contextLines.push(`Folders in scope: ${input.hub.folders.join(", ")}`);
  }
  if (input.hub.skillIds.length > 0) {
    contextLines.push(`Skills: ${input.hub.skillIds.join(", ")}`);
  }
  if (input.hub.researchEnabled) {
    contextLines.push("Research mode is enabled — prefer evidence from the repo.");
  }
  contextLines.push(`Parent task:\n${input.parentPrompt.trim()}`);
  contextLines.push(
    "Respond with a concise result for your role only. Do not rewrite the whole parent task.",
  );
  return contextLines.join("\n\n");
}

/**
 * Run enabled compose-hub subagent slots via ask callbacks (real LLM work).
 * Failures are captured per-slot so siblings can still complete.
 */
export async function spawnComposeSubagents(
  hub: PinComposerHub,
  parentPrompt: string,
  deps: SpawnComposeSubagentsDeps,
): Promise<{
  links: PinComposerHubSubagentLink[];
  childRunIds: string[];
  results: ComposeSubagentAskResult[];
}> {
  const enabled = hub.subagents.filter((slot) => slot.enabled);
  const results: ComposeSubagentAskResult[] = [];
  const links: PinComposerHubSubagentLink[] = enabled.map((slot) => ({
    slotId: slot.id,
    status: "queued" as const,
  }));

  await Promise.all(
    enabled.map(async (slot, index) => {
      links[index] = { slotId: slot.id, status: "running" };
      try {
        const question = buildComposeSubagentQuestion({
          slotName: slot.name,
          slotBrief: slot.brief,
          parentPrompt,
          hub,
        });
        const answer = await deps.ask({
          slotId: slot.id,
          name: slot.name,
          question,
        });
        const summary = answer.answer.trim().slice(0, 500);
        results.push({
          slotId: slot.id,
          name: slot.name,
          ok: true,
          summary,
          ...(answer.runId ? { runId: answer.runId } : {}),
        });
        links[index] = {
          slotId: slot.id,
          status: "done",
          summary,
          ...(answer.runId ? { runId: answer.runId } : {}),
        };
      } catch (error) {
        const summary =
          error instanceof Error ? error.message.slice(0, 500) : "Subagent failed";
        results.push({
          slotId: slot.id,
          name: slot.name,
          ok: false,
          summary,
        });
        links[index] = { slotId: slot.id, status: "error", summary };
      }
    }),
  );

  const childRunIds = links
    .map((link) => link.runId)
    .filter((id): id is string => Boolean(id));

  return { links, childRunIds, results };
}
