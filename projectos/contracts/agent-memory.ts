import { z } from "zod";

/** Claude-style note kinds. Procedures stay in skills, not here. */
export const MemoryNoteTypeSchema = z.enum([
  "user",
  "feedback",
  "project",
  "reference",
]);

/**
 * Admission is stricter than the four reference products:
 * only `candidate` and `corroborated` are injected.
 */
export const MemoryAdmissionStateSchema = z.enum([
  "observed",
  "candidate",
  "corroborated",
  "superseded",
]);

export const MemoryEntrySchema = z
  .object({
    text: z.string().min(1),
    type: MemoryNoteTypeSchema,
    state: MemoryAdmissionStateSchema,
    source: z.string().min(1),
    added: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
    topicFile: z.string().min(1),
  })
  .strict();

export const MemoryCandidateSchema = z
  .object({
    op: z.enum(["upsert", "forget"]),
    type: MemoryNoteTypeSchema.optional(),
    text: z.string(),
    topicFile: z.string().optional(),
    sourceRunId: z.string().min(1).max(80).optional(),
  })
  .strict();

export const MemorySettingsSchema = z
  .object({
    version: z.literal("0.1.0"),
    /** Master switch. Off stops both reads and writes. Default off. */
    enabled: z.boolean(),
    /** Inject candidate/corroborated index lines into later sessions. */
    useMemories: z.boolean(),
    /** Reserved for MEM-3. Explicit user remembers do not consult this flag. */
    generateMemories: z.boolean(),
    /** When true, key memory by this checkout instead of the git common dir. */
    isolateByCheckout: z.boolean(),
  })
  .strict();

export const MemoryWriteNoticeSchema = z
  .object({
    op: z.enum(["upsert", "forget"]),
    accepted: z.boolean(),
    text: z.string(),
    reason: z.string().optional(),
  })
  .strict();

export const AgentMemoryDocumentSchema = z
  .object({
    settings: MemorySettingsSchema,
    entries: z.array(MemoryEntrySchema),
    diagnostics: z.array(z.string()),
    nearBudget: z.boolean(),
    /** Lines that would be injected when useMemories is on. */
    injectableEntryCount: z.number().int().nonnegative(),
  })
  .strict();

export const MEMORY_INDEX_MAX_LINES = 200;
export const MEMORY_INDEX_MAX_CHARS = 25_000;

export const DEFAULT_MEMORY_SETTINGS: MemorySettings = {
  version: "0.1.0",
  enabled: false,
  useMemories: false,
  generateMemories: false,
  isolateByCheckout: false,
};

export type MemoryNoteType = z.infer<typeof MemoryNoteTypeSchema>;
export type MemoryAdmissionState = z.infer<typeof MemoryAdmissionStateSchema>;
export type MemoryEntry = z.infer<typeof MemoryEntrySchema>;
export type MemoryCandidate = z.infer<typeof MemoryCandidateSchema>;
export const MemorySettingsPatchSchema = MemorySettingsSchema.omit({
  version: true,
}).partial();

export type MemorySettings = z.infer<typeof MemorySettingsSchema>;
export type MemorySettingsPatch = z.infer<typeof MemorySettingsPatchSchema>;
export type MemoryWriteNotice = z.infer<typeof MemoryWriteNoticeSchema>;
export type AgentMemoryDocument = z.infer<typeof AgentMemoryDocumentSchema>;
