const PLAN_HINT =
  /\b(implement|architecture|design|refactor|migrate|multi[- ]?file|plan|方案|架构|实现|重构|迁移)\b/iu

/**
 * Heuristic: long or complex prompts suggest switching to Plan mode (DevPlan M2.A / P4).
 */
export function shouldSuggestPlanMode(text: string, chatMode: string): boolean {
  if (chatMode === 'plan') return false
  const trimmed = text.trim()
  if (trimmed.length < 40) return false
  if (PLAN_HINT.test(trimmed)) return true
  const sentenceCount = trimmed.split(/[.!?。！？\n]/u).filter((part) => part.trim().length > 12).length
  return sentenceCount >= 3 || trimmed.length >= 180
}
