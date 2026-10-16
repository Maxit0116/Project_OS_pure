import type { FunctionalNode } from '@contracts/index'
import { codeNodeDisplayTitle, codeNodeFilePath } from './codeNodeInteraction'

function basename(path: string): string {
  const parts = path.split(/[/\\]/)
  return parts[parts.length - 1] || path
}

/**
 * Heuristic projected copy (exports / path) is not an OS-level description.
 * Treat those as empty so the drawer can trigger on-demand LLM enrichment.
 */
export function isTrivialCodeDescription(
  node: FunctionalNode,
  text: string | null | undefined,
): boolean {
  const trimmed = text?.trim()
  if (!trimmed) return true
  const path = codeNodeFilePath(node)
  const title = codeNodeDisplayTitle(node)
  if (trimmed === title) return true
  if (path && (trimmed === path || trimmed === basename(path))) return true
  if (/^Exports\s+/i.test(trimmed)) return true
  return false
}
