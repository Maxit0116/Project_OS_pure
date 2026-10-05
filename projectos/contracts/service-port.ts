import { z } from "zod";

export const ServicePortStatusSchema = z.enum(["running", "stopped"]);

export const ServicePortSourceSchema = z.enum([
  "detected",
  "registered",
  "manual",
]);

export const ServicePortSchema = z
  .object({
    id: z.string().min(1),
    port: z.number().int().min(1).max(65535),
    host: z.string().min(1),
    label: z.string().min(1),
    url: z.string().url(),
    status: ServicePortStatusSchema,
    pid: z.number().int().positive().optional(),
    source: ServicePortSourceSchema,
  })
  .strict();

export type ServicePortStatus = z.infer<typeof ServicePortStatusSchema>;
export type ServicePortSource = z.infer<typeof ServicePortSourceSchema>;
export type ServicePort = z.infer<typeof ServicePortSchema>;
