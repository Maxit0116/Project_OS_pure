import { z } from "zod";

const Sha256Schema = z.string().regex(/^sha256:[a-f0-9]{64}$/u);

export const AgentValidationCriterionSchema = z.object({
  criterion: z.string().trim().min(1).max(500),
  status: z.enum(["satisfied", "unsatisfied", "uncertain"]),
  explanation: z.string().trim().min(1).max(1_000),
}).strict();

export const AgentProposalValidationResultSchema = z.object({
  version: z.literal("0.1.0"),
  runId: z.string().min(1),
  path: z.string().min(1),
  contextBundleHash: Sha256Schema,
  selectedFileSha256: Sha256Schema.optional(),
  createdFileSha256: Sha256Schema.optional(),
  verdict: z.enum(["valid", "invalid"]),
  criteria: z.array(AgentValidationCriterionSchema).min(1).max(20),
  scopeAssessment: z.object({
    status: z.enum(["compliant", "violation"]),
    explanation: z.string().trim().min(1).max(1_000),
  }).strict(),
  summary: z.string().trim().min(1).max(1_000),
  rationale: z.string().trim().min(1).max(2_000),
}).strict().superRefine((result, ctx) => {
  if (Boolean(result.selectedFileSha256) === Boolean(result.createdFileSha256)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["selectedFileSha256"],
      message: "Validation must bind either an existing snapshot or created content",
    });
  }
});

export type AgentProposalValidationResult = z.infer<
  typeof AgentProposalValidationResultSchema
>;
