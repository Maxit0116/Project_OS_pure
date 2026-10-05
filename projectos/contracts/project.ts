import { z } from "zod";

export const ProjectOSVersionSchema = z.literal("0.1.0");

export const ProjectFrameworkSchema = z.enum([
  "nextjs-app",
  "nextjs-pages",
  "node",
  "unknown",
]);

export const ProjectOSProjectSchema = z
  .object({
    version: ProjectOSVersionSchema,
    projectId: z.string(),
    workspaceRoot: z.string(),
    displayName: z.string(),
    framework: ProjectFrameworkSchema,
    createdAt: z.string(),
    updatedAt: z.string(),
    presentationMode: z.boolean(),
    activeScenarioId: z.string().optional(),
  })
  .strict();

export type ProjectOSVersion = z.infer<typeof ProjectOSVersionSchema>;
export type ProjectFramework = z.infer<typeof ProjectFrameworkSchema>;
export type ProjectOSProject = z.infer<typeof ProjectOSProjectSchema>;
