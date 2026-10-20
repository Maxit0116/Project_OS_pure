import { z } from "zod";

/** Derived file and symbol facts. Not part of the architecture graph. */
export const CODE_INTELLIGENCE_VERSION = "0.1.0" as const;

export const CodeIntelligenceLanguageSchema = z.enum([
  "typescript",
  "javascript",
  "unsupported",
]);

export const CodeInventoryFileSchema = z
  .object({
    path: z.string().min(1).max(1_024),
    language: CodeIntelligenceLanguageSchema,
    size: z.number().int().nonnegative().max(1_048_576),
    /** Same 24-hex digest as `hashFileContent`, so descriptions can be compared. */
    contentHash: z.string().regex(/^[a-f0-9]{24}$/u),
    /** Scan fingerprint. Unchanged size and mtime skip a rehash. */
    mtimeMs: z.number().int().nonnegative(),
  })
  .strict();

export const CodeInventoryOmissionReasonSchema = z.enum([
  "secret",
  "too_large",
  "binary",
  "unreadable",
]);

export const CodeInventoryOmissionSchema = z
  .object({
    path: z.string().min(1).max(1_024),
    reason: CodeInventoryOmissionReasonSchema,
    size: z.number().int().nonnegative(),
    mtimeMs: z.number().int().nonnegative(),
  })
  .strict();

export const CodeInventoryDocumentSchema = z
  .object({
    version: z.literal(CODE_INTELLIGENCE_VERSION),
    projectId: z.string().min(1),
    scannedAt: z.string().min(1),
    truncated: z.boolean(),
    files: z.array(CodeInventoryFileSchema).max(20_000),
    omissions: z.array(CodeInventoryOmissionSchema).max(20_000),
  })
  .strict();

export const CodeSymbolKindSchema = z.enum([
  "function",
  "class",
  "type",
  "interface",
  "enum",
  "const",
]);

export const CodeSymbolSchema = z
  .object({
    /** sha256 of path, kind, name, and startLine. A line move mints a new id. */
    id: z.string().regex(/^[a-f0-9]{64}$/u),
    kind: CodeSymbolKindSchema,
    name: z.string().min(1).max(512),
    path: z.string().min(1).max(1_024),
    startLine: z.number().int().positive(),
    exported: z.literal(true),
    contentHash: z.string().regex(/^[a-f0-9]{24}$/u),
  })
  .strict();

export const CodeSymbolFileOmissionSchema = z.enum([
  "parse_failed",
  "unresolved_export",
  "unclassified_export",
]);

export const CodeSymbolFileSchema = z
  .object({
    path: z.string().min(1).max(1_024),
    contentHash: z.string().regex(/^[a-f0-9]{24}$/u),
    symbols: z.array(CodeSymbolSchema).max(5_000),
    omissions: z.array(CodeSymbolFileOmissionSchema).max(8),
  })
  .strict();

export const CodeSymbolIndexDocumentSchema = z
  .object({
    version: z.literal(CODE_INTELLIGENCE_VERSION),
    projectId: z.string().min(1),
    files: z.array(CodeSymbolFileSchema).max(20_000),
  })
  .strict();

export const CodeSymbolQueryOmissionReasonSchema = z.enum([
  "parse_failed",
  "unsupported_language",
  "unresolved_export",
  "unclassified_export",
  "secret",
  "not_indexed",
]);

export const CodeSymbolQueryOmissionSchema = z
  .object({
    path: z.string().min(1).max(1_024),
    reason: CodeSymbolQueryOmissionReasonSchema,
  })
  .strict();

export const CodeSymbolHitSchema = CodeSymbolSchema.extend({
  nodeIds: z.array(z.string().min(1)).max(64),
}).strict();

export type CodeIntelligenceLanguage = z.infer<typeof CodeIntelligenceLanguageSchema>;
export type CodeInventoryFile = z.infer<typeof CodeInventoryFileSchema>;
export type CodeInventoryOmission = z.infer<typeof CodeInventoryOmissionSchema>;
export type CodeInventoryDocument = z.infer<typeof CodeInventoryDocumentSchema>;
export type CodeSymbolKind = z.infer<typeof CodeSymbolKindSchema>;
export type CodeSymbol = z.infer<typeof CodeSymbolSchema>;
export type CodeSymbolFileOmission = z.infer<typeof CodeSymbolFileOmissionSchema>;
export type CodeSymbolFile = z.infer<typeof CodeSymbolFileSchema>;
export type CodeSymbolIndexDocument = z.infer<typeof CodeSymbolIndexDocumentSchema>;
export type CodeSymbolQueryOmission = z.infer<typeof CodeSymbolQueryOmissionSchema>;
export type CodeSymbolHit = z.infer<typeof CodeSymbolHitSchema>;

export function emptyCodeInventoryDocument(projectId: string, scannedAt: string): CodeInventoryDocument {
  return {
    version: CODE_INTELLIGENCE_VERSION,
    projectId,
    scannedAt,
    truncated: false,
    files: [],
    omissions: [],
  };
}

export function emptyCodeSymbolIndexDocument(projectId: string): CodeSymbolIndexDocument {
  return {
    version: CODE_INTELLIGENCE_VERSION,
    projectId,
    files: [],
  };
}

export const CodeImpactFileSchema = z
  .object({
    path: z.string().min(1).max(1_024),
    distance: z.number().int().positive().max(10_000),
    nodeIds: z.array(z.string().min(1)).max(64),
  })
  .strict();

export const CodeImpactGroupSchema = z
  .object({
    onGraph: z.array(CodeImpactFileSchema).max(20_000),
    unlinked: z.array(CodeImpactFileSchema).max(20_000),
  })
  .strict();

export const CodeTestCandidateSchema = z
  .object({
    path: z.string().min(1).max(1_024),
    nodeIds: z.array(z.string().min(1)).max(64),
  })
  .strict();

export const CodeImpactOmissionReasonSchema = z.enum([
  "unresolved_import",
  "unsupported_language",
  "not_indexed",
  "scan_unavailable",
]);

export const CodeImpactResultSchema = z
  .object({
    targetPath: z.string().min(1).max(1_024),
    contentHash: z.string().regex(/^[a-f0-9]{24}$/u).nullable(),
    files: CodeImpactGroupSchema,
    symbols: z
      .object({
        name: z.string().min(1).max(512),
        references: CodeImpactGroupSchema,
      })
      .strict()
      .nullable(),
    tests: z.array(CodeTestCandidateSchema).max(20_000),
    omissions: z
      .array(
        z
          .object({
            path: z.string().min(1).max(1_024),
            reason: CodeImpactOmissionReasonSchema,
          })
          .strict(),
      )
      .max(20_000),
  })
  .strict();

export type CodeImpactFile = z.infer<typeof CodeImpactFileSchema>;
export type CodeImpactGroup = z.infer<typeof CodeImpactGroupSchema>;
export type CodeTestCandidate = z.infer<typeof CodeTestCandidateSchema>;
export type CodeImpactResult = z.infer<typeof CodeImpactResultSchema>;

export const CODE_UNDERSTANDING_REFRESH_LIMIT = 8;
