import { z } from "zod";

export const DiagnosticSeveritySchema = z.enum([
  "error",
  "warning",
  "info",
  "hint",
]);

export const DiagnosticItemSchema = z
  .object({
    id: z.string().min(1),
    filePath: z.string().min(1),
    line: z.number().int().min(1),
    column: z.number().int().min(1),
    endLine: z.number().int().min(1).optional(),
    endColumn: z.number().int().min(1).optional(),
    severity: DiagnosticSeveritySchema,
    message: z.string().min(1),
    source: z.string().optional(),
    code: z.union([z.string(), z.number()]).optional(),
  })
  .strict();

export type DiagnosticSeverity = z.infer<typeof DiagnosticSeveritySchema>;
export type DiagnosticItem = z.infer<typeof DiagnosticItemSchema>;
