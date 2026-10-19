import { z } from "zod";

export const SkillDescriptorSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    description: z.string().min(1),
    rootPath: z.string().min(1),
    skillFilePath: z.string().min(1),
    paths: z.array(z.string().min(1)).optional(),
    disableModelInvocation: z.boolean().optional(),
    scopeRoot: z.string().min(1).optional(),
    /** When true, skill can be pinned as a Custom Mode (DevPlan M2.C). */
    usableAsMode: z.boolean().optional(),
    icon: z.string().min(1).optional(),
    color: z.string().min(1).optional(),
  })
  .strict();

export const SkillContentSchema = z
  .object({
    descriptor: SkillDescriptorSchema,
    body: z.string(),
  })
  .strict();

export const ListSkillsResultSchema = z
  .object({
    skills: z.array(SkillDescriptorSchema),
  })
  .strict();

export type SkillDescriptor = z.infer<typeof SkillDescriptorSchema>;
export type SkillContent = z.infer<typeof SkillContentSchema>;
export type ListSkillsResult = z.infer<typeof ListSkillsResultSchema>;
