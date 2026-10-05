import { z } from "zod";

export const PROJECT_DESCRIPTION_MAX_CHARACTERS = 2_000;
export const PROJECT_DESCRIPTION_MAX_ESTIMATED_TOKENS = 500;

export const ProjectDescriptionSchema = z
  .object({
    version: z.literal("0.1.0"),
    projectId: z.string().min(1),
    conciseDescription: z
      .string()
      .trim()
      .min(1)
      .refine(
        (value) => [...value].length <= PROJECT_DESCRIPTION_MAX_CHARACTERS,
        `Project description must not exceed ${PROJECT_DESCRIPTION_MAX_CHARACTERS} Unicode characters`,
      )
      .refine(
        (value) => estimateProjectDescriptionTokens(value) <= PROJECT_DESCRIPTION_MAX_ESTIMATED_TOKENS,
        `Project description must not exceed ${PROJECT_DESCRIPTION_MAX_ESTIMATED_TOKENS} estimated tokens`,
      ),
    source: z.enum(["user", "derived"]),
    updatedAt: z.string().min(1),
  })
  .strict();

export type ProjectDescription = z.infer<typeof ProjectDescriptionSchema>;

export function estimateProjectDescriptionTokens(value: string): number {
  return Math.ceil([...value].length / 4);
}
