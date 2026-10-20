/**
 * SEC-3. The model may see these in a user message or a fenced data block.
 * They stay out of the Project Rules section. Adding a source means updating
 * this table and the assembly test together. Prompt-only wording does not count.
 */
export const UNTRUSTED_CONTENT_CATALOG = {
  function_graph: { placement: "data_block" },
  project_description: { placement: "data_block" },
  file_body: { placement: "data_block" },
  retrieval_quote: { placement: "data_block" },
  external_doc: { placement: "data_block", enabledByDefault: false },
  memory_index: { placement: "data_block" },
  session_summary: { placement: "data_block" },
  tool_output: { placement: "data_block" },
  web_or_mcp_text: { placement: "data_block", enabledByDefault: false },
  task_appendix: { placement: "data_block" },
} as const;

export type UntrustedContentKind = keyof typeof UNTRUSTED_CONTENT_CATALOG;

export const UNTRUSTED_CONTEXT_SOURCES = Object.keys(
  UNTRUSTED_CONTENT_CATALOG,
) as UntrustedContentKind[];

export type UntrustedContextSource = UntrustedContentKind;

export function projectRulesSection(instructions: string): string {
  const marker = "## Project Rules";
  const start = instructions.indexOf(marker);
  if (start < 0) return "";
  const rest = instructions.slice(start + marker.length);
  const next = rest.search(/\n## [^#]/u);
  const body = next < 0 ? rest : rest.slice(0, next);
  return body.trim();
}
