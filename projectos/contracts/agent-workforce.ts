import { z } from "zod";

import {
  AgentDefinitionKindSchema,
  AgentDefinitionSchema,
  type AgentDefinition,
} from "./agent-pool-trace.js";

export const WorkforceAgentDraftSchema = z
  .object({
    displayName: z.string().trim().min(1).max(120),
    roleLabel: z.string().trim().min(1).max(80).optional(),
    instructions: z.string().max(12_000).default(""),
    modelProfileId: z.string().min(1).nullable().optional(),
    skillIds: z.array(z.string().min(1).max(120)).max(64).default([]),
    mcpServerIds: z.array(z.string().min(1).max(80)).max(64).default([]),
    permissionNotes: z.string().max(2000).optional(),
  })
  .strict();

export const DraftWorkforceAgentRequestSchema = z
  .object({
    projectId: z.string().min(1),
    prompt: z.string().trim().min(1).max(4000),
  })
  .strict();

export const DraftWorkforceAgentResultSchema = z
  .object({
    draft: WorkforceAgentDraftSchema,
    /** Echo of the user prompt used for drafting. */
    sourcePrompt: z.string().min(1),
  })
  .strict();

export const CreateWorkforceAgentRequestSchema = z
  .object({
    projectId: z.string().min(1),
    draft: WorkforceAgentDraftSchema,
  })
  .strict();

export const UpdateWorkforceAgentRequestSchema = z
  .object({
    projectId: z.string().min(1),
    definitionId: z.string().min(1),
    draft: WorkforceAgentDraftSchema,
  })
  .strict();

export const ListWorkforceAgentsRequestSchema = z
  .object({
    projectId: z.string().min(1),
  })
  .strict();

export const ListWorkforceAgentsResultSchema = z
  .object({
    agents: z.array(AgentDefinitionSchema),
  })
  .strict();

export function isWorkforceAgent(definition: AgentDefinition): boolean {
  return (definition.config.kind ?? "pool_lane") === "workforce";
}

export function createWorkforceDefinitionId(): string {
  return `agent_${crypto.randomUUID()}`;
}

export {
  AgentDefinitionKindSchema,
  AgentDefinitionSchema,
  type AgentDefinition,
};

export type WorkforceAgentDraft = z.infer<typeof WorkforceAgentDraftSchema>;
export type DraftWorkforceAgentRequest = z.infer<typeof DraftWorkforceAgentRequestSchema>;
export type DraftWorkforceAgentResult = z.infer<typeof DraftWorkforceAgentResultSchema>;
export type CreateWorkforceAgentRequest = z.infer<typeof CreateWorkforceAgentRequestSchema>;
export type UpdateWorkforceAgentRequest = z.infer<typeof UpdateWorkforceAgentRequestSchema>;
export type ListWorkforceAgentsRequest = z.infer<typeof ListWorkforceAgentsRequestSchema>;
export type ListWorkforceAgentsResult = z.infer<typeof ListWorkforceAgentsResultSchema>;
