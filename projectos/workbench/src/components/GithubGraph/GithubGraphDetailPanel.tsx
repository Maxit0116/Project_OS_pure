import { useState } from 'react'
import { GitBranch, GitCommitHorizontal, GitPullRequest, Sparkles } from 'lucide-react'
import type {
  GithubFeature,
  WorkspaceGitCheckRun,
  WorkspaceGitCommitDetail,
} from '@contracts/index'
import { useI18n } from '../../i18n'
import styles from './GithubGraphDetailPanel.module.css'

type DetailTab = 'information' | 'changes' | 'files'

type Props = {
  kind: 'commit' | 'feature'
  commitDetail?: WorkspaceGitCommitDetail | null
  feature?: GithubFeature | null
  branchCount?: number
  prCount?: number
  checkRuns?: WorkspaceGitCheckRun[]
  onOpenHistory?: () => void
  onSafeRevert?: () => void
  onClose?: () => void
  loading?: boolean
  style?: React.CSSProperties
  /** Fixed right pane in swimlane mode (not floating popover). */
  docked?: boolean
}

export default function GithubGraphDetailPanel({
  kind,
  commitDetail,
  feature,
  branchCount = 0,
  prCount = 0,
  checkRuns = [],
  onOpenHistory,
  onSafeRevert,
  onClose,
  loading = false,
  style,
  docked = false,
}: Props) {
  const { ts } = useI18n()
  const [tab, setTab] = useState<DetailTab>('information')

  return (
    <aside
      className={`${styles.popover}${docked ? ` ${styles.docked}` : ''}`}
      style={style}
      data-node-popup=""
      data-detail-popover=""
      role="dialog"
      aria-label={
        kind === 'commit'
          ? ts('chat.githubGraph.kindCommit')
          : ts('chat.githubGraph.kindFeature')
      }
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className={styles.header}>
        <div className={styles.kind}>
          {kind === 'commit' ? (
            <GitCommitHorizontal size={12} strokeWidth={2} aria-hidden />
          ) : (
            <Sparkles size={12} strokeWidth={2} aria-hidden />
          )}
          {kind === 'commit'
            ? ts('chat.githubGraph.kindCommit')
            : ts('chat.githubGraph.kindFeature')}
        </div>
        {onClose ? (
          <button type="button" className={styles.close} onClick={onClose}>
            {ts('chat.githubGraph.detailClose')}
          </button>
        ) : null}
      </div>

      {loading ? (
        <p className={styles.meta}>{ts('chat.githubGraph.loading')}</p>
      ) : null}

      {kind === 'commit' && commitDetail ? (
        <>
          {!commitDetail.ok ? (
            <p className={styles.error}>{commitDetail.message}</p>
          ) : (
            <>
              <h3 className={styles.title}>
                {commitDetail.commit?.message.split('\n')[0] ?? '—'}
              </h3>
              <div className={styles.tabs} role="tablist">
                {(
                  [
                    ['information', ts('chat.githubGraph.detailTabInformation')],
                    ['changes', ts('chat.githubGraph.detailTabChanges')],
                    ['files', ts('chat.githubGraph.detailTabFiles')],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={tab === id}
                    className={`${styles.tab}${tab === id ? ` ${styles.tabActive}` : ''}`}
                    onClick={() => setTab(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {tab === 'information' ? (
                <>
                  <div className={styles.meta}>
                    <code>{commitDetail.commit?.sha.slice(0, 12)}</code>
                    {commitDetail.commit?.authorName ? (
                      <span>{commitDetail.commit.authorName}</span>
                    ) : null}
                    {commitDetail.commit?.authoredAt ? (
                      <span>{commitDetail.commit.authoredAt}</span>
                    ) : null}
                  </div>
                  {(commitDetail.commit?.parentShas.length ?? 0) > 0 ? (
                    <div className={styles.section}>
                      <div className={styles.label}>
                        {ts('chat.githubGraph.detailParents')}
                      </div>
                      <ul className={styles.list}>
                        {commitDetail.commit?.parentShas.map((sha) => (
                          <li key={sha}>
                            <code>{sha.slice(0, 12)}</code>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {checkRuns.length > 0 ? (
                    <div className={styles.section}>
                      <div className={styles.label}>
                        {ts('chat.githubGraph.detailChecks')}
                      </div>
                      <ul className={styles.list}>
                        {checkRuns.map((run) => (
                          <li key={run.id}>
                            <span className={styles.badge}>
                              {run.name}: {run.conclusion ?? run.status}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {onSafeRevert ? (
                    <div className={styles.actions}>
                      <button
                        type="button"
                        className={styles.primary}
                        onClick={onSafeRevert}
                      >
                        {ts('chat.githubGraph.menuSafeRevert')}
                      </button>
                    </div>
                  ) : null}
                </>
              ) : null}

              {tab === 'changes' ? (
                <div className={styles.section}>
                  {commitDetail.patch ? (
                    <pre className={styles.patch}>
                      {commitDetail.patch}
                      {commitDetail.patchTruncated
                        ? `\n… ${ts('chat.githubGraph.detailPatchTruncated')}`
                        : ''}
                    </pre>
                  ) : (
                    <p className={styles.meta}>
                      {ts('chat.githubGraph.detailNoPatch')}
                    </p>
                  )}
                </div>
              ) : null}

              {tab === 'files' ? (
                <div className={styles.section}>
                  <div className={styles.label}>
                    {ts('chat.githubGraph.detailFiles')}
                    {commitDetail.patchTruncated
                      ? ` · ${ts('chat.githubGraph.detailPatchTruncated')}`
                      : ''}
                  </div>
                  {(commitDetail.files?.length ?? 0) === 0 ? (
                    <p className={styles.meta}>
                      {ts('chat.githubGraph.detailNoFiles')}
                    </p>
                  ) : (
                    <ul className={styles.fileList}>
                      {commitDetail.files?.map((file) => (
                        <li key={`${file.status}:${file.path}`}>
                          <span className={styles.fileStatus}>{file.status}</span>
                          <span className={styles.filePath}>{file.path}</span>
                          {file.additions !== undefined ||
                          file.deletions !== undefined ? (
                            <span className={styles.fileStats}>
                              +{file.additions ?? 0}/−{file.deletions ?? 0}
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : null}
            </>
          )}
        </>
      ) : null}

      {kind === 'feature' && feature ? (
        <>
          <h3 className={styles.title}>{feature.title}</h3>
          {feature.description ? (
            <p className={styles.description}>{feature.description}</p>
          ) : null}
          <div className={styles.meta}>
            <span className={styles.badge}>{feature.status}</span>
            <span className={styles.badge}>
              <GitBranch size={10} strokeWidth={2} aria-hidden /> {branchCount}
            </span>
            <span className={styles.badge}>
              <GitPullRequest size={10} strokeWidth={2} aria-hidden /> {prCount}
            </span>
          </div>
          {onOpenHistory ? (
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.primary}
                onClick={onOpenHistory}
              >
                {ts('chat.githubGraph.openInHistory')}
              </button>
            </div>
          ) : null}
        </>
      ) : null}
    </aside>
  )
}
