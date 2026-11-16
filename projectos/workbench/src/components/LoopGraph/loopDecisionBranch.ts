/**
 * Decision-branch semantics for Condition + Human Approval diamonds.
 *
 * Vertical time spine convention (TB):
 *   S = pass / agree (happy path down the spine)
 *   W = fail / disagree
 *   E = other / special case
 *   N = custom (unusual outgoing; still labeled)
 *
 * `branchLabel` is the short chip near the source; mid-edge `prompt` stays as-is.
 * When the source port changes, callers overwrite `branchLabel` (always follow).
 */

import type {
  IntentEdgePort,
  IntentGraphEdge,
  IntentGraphNode,
} from '@contracts/index'
import type { Point } from './loopEdgeRouting'

export type DecisionBranchKind = 'approval' | 'condition'

export type DecisionBranchRole = 'pass' | 'fail' | 'other' | 'custom'

/** i18n key suffix under `chat.loopGraph.decisionBranch.*`. */
export type DecisionBranchLabelKey =
  | 'agree'
  | 'disagree'
  | 'pass'
  | 'fail'
  | 'other'
  | 'custom'

/**
 * Condition diamonds + Human Approval only.
 * `humanMode: decision` (and review/input/takeover) stay out — their outcomes
 * are too open-ended for agree/disagree chips.
 */
export function isDecisionBranchSourceNode(
  node: IntentGraphNode | undefined | null,
): boolean {
  if (!node) return false
  if (node.logicKind === 'condition') return true
  if (node.type === 'logic' && !node.logicKind) return true
  if (node.humanMode === 'approval') return true
  if (node.type === 'human' && node.humanMode == null) return true
  return false
}

export function decisionBranchKindForNode(
  node: IntentGraphNode,
): DecisionBranchKind {
  if (node.humanMode === 'approval' || node.type === 'human') return 'approval'
  return 'condition'
}

export function decisionBranchRoleForPort(
  port: IntentEdgePort,
): DecisionBranchRole {
  switch (port) {
    case 's':
      return 'pass'
    case 'w':
      return 'fail'
    case 'e':
      return 'other'
    case 'n':
    default:
      return 'custom'
  }
}

export function decisionBranchKeyForPort(
  port: IntentEdgePort,
  kind: DecisionBranchKind,
): string {
  const role = decisionBranchRoleForPort(port)
  if (kind === 'approval') {
    if (role === 'pass') return 'agree'
    if (role === 'fail') return 'disagree'
    if (role === 'other') return 'other'
    return 'custom'
  }
  if (role === 'pass') return 'pass'
  if (role === 'fail') return 'fail'
  if (role === 'other') return 'other'
  return 'custom'
}

export function decisionBranchLabelKeyForPort(
  port: IntentEdgePort,
  kind: DecisionBranchKind,
): DecisionBranchLabelKey {
  const role = decisionBranchRoleForPort(port)
  if (kind === 'approval') {
    if (role === 'pass') return 'agree'
    if (role === 'fail') return 'disagree'
    if (role === 'other') return 'other'
    return 'custom'
  }
  if (role === 'pass') return 'pass'
  if (role === 'fail') return 'fail'
  if (role === 'other') return 'other'
  return 'custom'
}

export function decisionBranchPatchForPort(
  port: IntentEdgePort,
  node: IntentGraphNode,
  resolveLabel: (key: DecisionBranchLabelKey) => string,
): Pick<IntentGraphEdge, 'sourcePort' | 'branchKey' | 'branchLabel' | 'kind'> {
  const kind = decisionBranchKindForNode(node)
  const labelKey = decisionBranchLabelKeyForPort(port, kind)
  return {
    sourcePort: port,
    branchKey: decisionBranchKeyForPort(port, kind),
    branchLabel: resolveLabel(labelKey),
    ...(kind === 'condition' ? { kind: 'conditional' as const } : {}),
  }
}

/**
 * Point at fraction `t` along an orthogonal polyline (0 = source, 1 = target).
 */
export function pointAlongPolyline(points: Point[], t: number): Point {
  if (points.length === 0) return { x: 0, y: 0 }
  if (points.length === 1) return { ...points[0]! }
  const clamped = Math.min(1, Math.max(0, t))
  let total = 0
  const segLens: number[] = []
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i]!
    const b = points[i + 1]!
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    segLens.push(len)
    total += len
  }
  if (total < 1e-6) return { ...points[0]! }
  let remain = total * clamped
  for (let i = 0; i < segLens.length; i += 1) {
    const len = segLens[i]!
    if (remain <= len || i === segLens.length - 1) {
      const a = points[i]!
      const b = points[i + 1]!
      const u = len < 1e-6 ? 0 : remain / len
      return {
        x: a.x + (b.x - a.x) * u,
        y: a.y + (b.y - a.y) * u,
      }
    }
    remain -= len
  }
  return { ...points[points.length - 1]! }
}

/** Fallback fraction when the source box check cannot clear the diamond. */
export const DECISION_BRANCH_LABEL_T = 0.28

/** Stock strings written by older sessions / other locales — still count as defaults. */
const STOCK_BRANCH_LABELS: Record<DecisionBranchLabelKey, readonly string[]> = {
  agree: ['Agree', '同意'],
  disagree: ['Disagree', '不同意'],
  pass: ['Pass', '通过'],
  fail: ['Fail', '不通过'],
  other: ['Other', '特例'],
  custom: ['Custom', '其他'],
}

export function decisionBranchLabelKeyFromBranchKey(
  branchKey: string | undefined,
): DecisionBranchLabelKey | null {
  if (!branchKey) return null
  if (
    branchKey === 'agree' ||
    branchKey === 'disagree' ||
    branchKey === 'pass' ||
    branchKey === 'fail' ||
    branchKey === 'other' ||
    branchKey === 'custom'
  ) {
    return branchKey
  }
  return null
}

export function isStockDecisionBranchLabel(
  label: string | undefined,
  key: DecisionBranchLabelKey,
): boolean {
  if (!label?.trim()) return true
  return STOCK_BRANCH_LABELS[key].includes(label.trim())
}

/**
 * Prefer live i18n for stock agree/disagree chips; keep true custom edits.
 */
export function resolveDecisionBranchDisplayLabel(
  edge: Pick<IntentGraphEdge, 'branchKey' | 'branchLabel'>,
  resolveLabel: (key: DecisionBranchLabelKey) => string,
): string {
  const key = decisionBranchLabelKeyFromBranchKey(edge.branchKey)
  if (key) {
    if (isStockDecisionBranchLabel(edge.branchLabel, key)) {
      return resolveLabel(key)
    }
    return edge.branchLabel!.trim()
  }
  return edge.branchLabel?.trim() || resolveLabel('custom')
}

/**
 * Anchor just outside the source node so the chip is not covered by the diamond.
 */
export function decisionBranchLabelPoint(
  points: Point[],
  sourceBox: { x: number; y: number; width: number; height: number },
  pad = 16,
): Point {
  const left = sourceBox.x - pad
  const top = sourceBox.y - pad
  const right = sourceBox.x + sourceBox.width + pad
  const bottom = sourceBox.y + sourceBox.height + pad
  const inside = (p: Point) =>
    p.x >= left && p.x <= right && p.y >= top && p.y <= bottom

  for (let step = 0; step <= 20; step += 1) {
    const t = 0.12 + step * 0.03
    const p = pointAlongPolyline(points, Math.min(0.72, t))
    if (!inside(p)) return p
  }
  return pointAlongPolyline(points, DECISION_BRANCH_LABEL_T)
}
