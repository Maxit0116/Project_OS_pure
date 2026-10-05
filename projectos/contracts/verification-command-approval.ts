import { z } from "zod";

import { ExecCommandSchema } from "./exec-command.js";

const CommandSetHashSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/u);

const VerificationCommandApprovalBaseSchema = z.object({
  projectId: z.string().min(1),
}).strict();

export const VerificationCommandApprovalStatusSchema = z.discriminatedUnion(
  "status",
  [
    VerificationCommandApprovalBaseSchema.extend({
      status: z.literal("not_configured"),
      commands: z.array(ExecCommandSchema).length(0),
    }).strict(),
    VerificationCommandApprovalBaseSchema.extend({
      status: z.literal("approval_required"),
      commandSetHash: CommandSetHashSchema,
      commands: z.array(ExecCommandSchema).min(1).max(10),
    }).strict(),
    VerificationCommandApprovalBaseSchema.extend({
      status: z.literal("approved"),
      commandSetHash: CommandSetHashSchema,
      commands: z.array(ExecCommandSchema).min(1).max(10),
    }).strict(),
  ],
);

export type VerificationCommandApprovalStatus = z.infer<
  typeof VerificationCommandApprovalStatusSchema
>;
