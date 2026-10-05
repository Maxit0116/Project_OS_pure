import { z } from "zod";

export const DocumentSymbolKindSchema = z.enum([
  "file",
  "module",
  "namespace",
  "package",
  "class",
  "method",
  "property",
  "field",
  "constructor",
  "enum",
  "interface",
  "function",
  "variable",
  "constant",
  "string",
  "number",
  "boolean",
  "array",
  "object",
  "key",
  "null",
  "enumMember",
  "struct",
  "event",
  "operator",
  "typeParameter",
  "unknown",
]);

export const DocumentSymbolItemSchema: z.ZodType<DocumentSymbolItem> = z.lazy(() =>
  z
    .object({
      name: z.string().min(1),
      kind: DocumentSymbolKindSchema,
      startLine: z.number().int().positive(),
      startColumn: z.number().int().positive(),
      endLine: z.number().int().positive(),
      endColumn: z.number().int().positive(),
      children: z.array(DocumentSymbolItemSchema),
    })
    .strict(),
);

export type DocumentSymbolKind = z.infer<typeof DocumentSymbolKindSchema>;
export type DocumentSymbolItem = {
  name: string;
  kind: DocumentSymbolKind;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
  children: DocumentSymbolItem[];
};
