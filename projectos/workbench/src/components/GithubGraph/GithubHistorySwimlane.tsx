import { useMemo } from 'react'
import type {
  GithubHistoryScope,
  GithubHistoryWindow,
  WorkspaceGitCheckRun,
  WorkspaceGitCommitDetail,
} from '@contracts/index'
import { useI18n } from '../../i18n'
import type { GithubSwimlaneModel, GithubSwimlaneRow } from './buildGithubSwimlaneModel'
import GithubGraphDetailPanel from './GithubGraphDetailPanel'
import styles from './GithubHistorySwimlane.module.css'

const LANE_COLORS = [
  '#f97316',
  '#22c55e',
  '#14b8a6',
  '#3b82f6',
  '#a855f7',
  '#eab308',
  '#ec4899',
  '#94a3b8',
]

const ROW_H = 32
const LANE_GAP = 14
const PAD_X = 10

type Props = {
  scope: GithubHistoryScope
  model: GithubSwimlaneModel
  selectedSha: string | null
  onSelectSha: (sha: string | null) => void
  onWindowChange: (window: GithubHistoryWindow) => void
  onToggleFirstParent: () => void
  onBack: () => void
  commitDetail: WorkspaceGitCommitDetail | null
  checkRuns: WorkspaceGitCheckRun[]
  detailLoading: boolean
  onSafeRevert?: () => void
}

function relativeTime(iso: string | undefined, fallback: string): string {
  if (!iso) return fallback
  const then = Date.parse(iso)
  if (!Number.isFinite(then)) return iso
  const delta = Date.now() - then
  const mins = Math.round(delta / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 48) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 60) return `${days}d ago`
  return iso.slice(0, 10)
}

function RailCell({
  row,
  laneCount,
}: {
  row: GithubSwimlaneRow
  laneCount: number
}) {
  const width = Math.max(PAD_X * 2 + laneCount * LANE_GAP, 48)
  const cy = ROW_H / 2
  const xFor = (lane: number) => PAD_X + lane * LANE_GAP
  const color = LANE_COLORS[row.layout.lane % LANE_COLORS.length] ?? LANE_COLORS[0]

  return (
    <svg
      className={styles.graphSvg}
      width={width}
      height={ROW_H}
      viewBox={`0 0 ${width} ${ROW_H}`}
      aria-hidden
    >
      {row.layout.rails.map((rail, index) => {
        const x1 = xFor(rail.fromLane)
        const x2 = xFor(rail.toLane)
        const railColor =
          LANE_COLORS[rail.toLane % LANE_COLORS.length] ?? LANE_COLORS[0]
        if (x1 === x2) {
          return (
            <line
              key={`r-${index}`}
              x1={x1}
              y1={0}
              x2={x2}
              y2={ROW_H}
              stroke={railColor}
              strokeWidth={1.5}
            />
          )
        }
        const mid = ROW_H / 2
        return (
          <path
            key={`r-${index}`}
            d={`M ${x1} 0 L ${x1} ${mid * 0.35} C ${x1} ${mid}, ${x2} ${mid}, ${x2} ${mid * 1.65} L ${x2} ${ROW_H}`}
            fill="none"
            stroke={railColor}
            strokeWidth={1.5}
          />
        )
      })}
      {row.kind === 'wip' ? (
        <rect
          x={xFor(row.layout.lane) - 4}
          y={cy - 4}
          width={8}
          height={8}
          rx={1}
          fill={color}
        />
      ) : (
        <circle
          cx={xFor(row.layout.lane)}
          cy={cy}
          r={row.isMerge ? 5 : 3.5}
          fill={color}
          stroke="var(--tech-bg-side-panel)"
          strokeWidth={1}
        />
      )}
      {row.isMerge ? (
        <text
          x={xFor(row.layout.lane)}
          y={cy + 3}
          textAnchor="middle"
          fontSize={8}
          fill="var(--tech-bg-side-panel)"
          fontWeight={700}
        >
          +
        </text>
      ) : null}
    </svg>
  )
}

export default function GithubHistorySwimlane({
  scope,
  model,
  selectedSha,
  onSelectSha,
  onWindowChange,
  onToggleFirstParent,
  onBack,
  commitDetail,
  checkRuns,
  detailLoading,
  onSafeRevert,
}: Props) {
  const { ts } = useI18n()
  const scopeLabel = useMemo(() => {
    if (scope.sourceKind === 'pr' && scope.prNumber) {
      return `PR #${scope.prNumber}`
    }
    if (scope.branchRefs.length === 1) return scope.branchRefs[0]
    if (scope.branchRefs.length > 1) {
      return `${scope.branchRefs.length} branches`
    }
    return scope.sourceId
  }, [scope])

  if (model.emptyReason || model.rows.length === 0) {
    return (
      <div className={styles.root}>
        <div className={styles.toolbar}>
          <span className={styles.scopeChip}>{scopeLabel}</span>
          <span className={styles.orderHint}>
            {ts('chat.githubGraph.swimlaneTopoHint')}
          </span>
        </div>
        <div className={styles.empty}>
          <p>{model.emptyMessage ?? ts('chat.githubGraph.historyEmpty')}</p>
          <div className={styles.emptyActions}>
            <button type="button" className={styles.toolButton} onClick={onBack}>
              {ts('chat.githubGraph.navBack')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  const windowKind = scope.window.kind

  return (
    <div className={styles.root}>
      <div className={styles.toolbar}>
        <span className={styles.scopeChip} title={scope.branchRefs.join(', ')}>
          {scopeLabel}
        </span>
        <div className={styles.toolbarGroup} role="group" aria-label={ts('chat.githubGraph.swimlaneWindow')}>
          <button
            type="button"
            className={`${styles.toolButton}${windowKind === 'commit-cap' ? ` ${styles.toolButtonActive}` : ''}`}
            onClick={() =>
              onWindowChange({
                kind: 'commit-cap',
                commitCap: scope.window.commitCap,
              })
            }
          >
            {ts('chat.githubGraph.swimlaneWindowCap').replace(
              '{n}',
              String(scope.window.commitCap),
            )}
          </button>
          <button
            type="button"
            className={`${styles.toolButton}${windowKind === 'since-days' ? ` ${styles.toolButtonActive}` : ''}`}
            onClick={() =>
              onWindowChange({
                kind: 'since-days',
                commitCap: scope.window.commitCap,
                sinceDays: scope.window.sinceDays ?? 14,
              })
            }
          >
            {ts('chat.githubGraph.swimlaneWindowDays')}
          </button>
          <button
            type="button"
            className={`${styles.toolButton}${windowKind === 'since-fork' ? ` ${styles.toolButtonActive}` : ''}`}
            onClick={() =>
              onWindowChange({
                kind: 'since-fork',
                commitCap: scope.window.commitCap,
              })
            }
          >
            {ts('chat.githubGraph.swimlaneWindowFork')}
          </button>
        </div>
        <button
          type="button"
          className={`${styles.toolButton}${scope.firstParentOnly ? ` ${styles.toolButtonActive}` : ''}`}
          onClick={onToggleFirstParent}
        >
          {ts('chat.githubGraph.swimlaneFirstParent')}
        </button>
        <span className={styles.orderHint}>
          {ts('chat.githubGraph.swimlaneTopoHint')}
        </span>
      </div>

      <div className={styles.body}>
        <div className={styles.listPane}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={`${styles.th} ${styles.thGraph}`}>
                  {ts('chat.githubGraph.swimlaneColGraph')}
                </th>
                <th className={`${styles.th} ${styles.thSubject}`}>
                  {ts('chat.githubGraph.swimlaneColSubject')}
                </th>
                <th className={`${styles.th} ${styles.thAuthor}`}>
                  {ts('chat.githubGraph.swimlaneColAuthor')}
                </th>
                <th className={`${styles.th} ${styles.thSha}`}>
                  {ts('chat.githubGraph.swimlaneColSha')}
                </th>
                <th className={`${styles.th} ${styles.thTime}`}>
                  {ts('chat.githubGraph.swimlaneColTime')}
                </th>
              </tr>
            </thead>
            <tbody>
              {model.rows.map((row) => {
                const selected =
                  row.kind === 'commit' && row.sha === selectedSha
                return (
                  <tr
                    key={row.id}
                    className={`${styles.row}${selected ? ` ${styles.rowSelected}` : ''}${row.highlighted ? ` ${styles.rowHighlighted}` : ''}`}
                    onClick={() => {
                      if (row.kind === 'commit' && row.sha) onSelectSha(row.sha)
                      else onSelectSha(null)
                    }}
                  >
                    <td className={`${styles.td} ${styles.graphCell}`}>
                      <RailCell row={row} laneCount={model.layout.laneCount} />
                    </td>
                    <td className={styles.td}>
                      <span className={styles.subject}>
                        {row.kind === 'wip' ? (
                          <span className={`${styles.pill} ${styles.pillWip}`}>
                            WIP
                          </span>
                        ) : null}
                        {row.refLabels.map((label) => (
                          <span key={label} className={styles.pill}>
                            {label}
                          </span>
                        ))}
                        {row.prBadges.map((number) => (
                          <span
                            key={`pr-${number}`}
                            className={`${styles.pill} ${styles.pillPr}`}
                          >
                            #{number}
                          </span>
                        ))}
                        <span className={styles.subjectText}>{row.subject}</span>
                      </span>
                    </td>
                    <td className={`${styles.td} ${styles.tdMuted}`}>
                      {row.authorName ?? '—'}
                    </td>
                    <td className={`${styles.td} ${styles.tdMuted}`}>
                      {row.sha ? row.sha.slice(0, 10) : '—'}
                    </td>
                    <td className={`${styles.td} ${styles.tdMuted}`}>
                      {row.kind === 'wip'
                        ? '—'
                        : relativeTime(row.authoredAt, '—')}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {model.truncated ? (
            <div className={styles.capNote}>
              {ts('chat.githubGraph.historyTruncated').replace(
                '{n}',
                String(scope.window.commitCap),
              )}
            </div>
          ) : null}
        </div>

        <div className={styles.detailPane}>
          {selectedSha ? (
            <GithubGraphDetailPanel
              kind="commit"
              commitDetail={commitDetail}
              checkRuns={checkRuns}
              loading={detailLoading}
              docked
              onSafeRevert={onSafeRevert}
            />
          ) : (
            <div className={styles.empty}>
              <p>{ts('chat.githubGraph.detailHint')}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
