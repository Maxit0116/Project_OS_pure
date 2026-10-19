import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { z } from "zod";

const ExternalDocumentSchema = z
  .object({
    source: z.string().min(1).max(200),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
    license: z.string().min(1).max(120).optional(),
    text: z.string().min(1).max(2_000),
  })
  .strict();

const ExternalDocFileSchema = z
  .object({
    enabled: z.boolean(),
    documents: z.array(ExternalDocumentSchema).max(20),
  })
  .strict();

export interface ExternalDocHit {
  source: string;
  date: string;
  license?: string;
  quote: string;
}

/** Opt-in only. Disabled or missing files yield nothing. */
export function searchExternalDocs(projectOSRoot: string, query: string): ExternalDocHit[] {
  const file = join(projectOSRoot, "retrieval", "external-docs.json");
  if (!existsSync(file)) return [];
  let parsed: z.infer<typeof ExternalDocFileSchema>;
  try {
    parsed = ExternalDocFileSchema.parse(JSON.parse(readFileSync(file, "utf8")));
  } catch {
    return [];
  }
  if (!parsed.enabled) return [];
  const needle = query.trim();
  if (!needle) return [];
  const hits: ExternalDocHit[] = [];
  for (const document of parsed.documents) {
    if (!document.text.includes(needle) && !document.source.includes(needle)) continue;
    hits.push({
      source: document.source,
      date: document.date,
      ...(document.license ? { license: document.license } : {}),
      quote: document.text.replaceAll("```", "'''").slice(0, 500),
    });
  }
  return hits;
}
