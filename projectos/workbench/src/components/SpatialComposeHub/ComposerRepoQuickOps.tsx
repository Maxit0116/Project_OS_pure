import { ExternalLink, GitBranch } from 'lucide-react'
import { useMemo } from 'react'
import type { PinComposerHub } from '@contracts/spatial-pin'
import { useWorkbenchStore } from '../../state/workbenchStore'
import type { ComposerRepoOpsHost } from './composerRepoOpsHost'
import { createWorkbenchComposerRepoOpsHost } from './composerRepoOpsHost'
import type { ComposeHubDataSource } from './hubActions'
import type { ComposeHubStrings } from './composeHubStrings'
import {
  remoteUrlToHttps,
  resolveRepoSyncButtons,
} from './repoQuickOps'
import { useComposerRepoOps } from './useComposerRepoOps'
import styles from './ComposerRepoQuickOps.module.css'

interface Props {
  hub: PinComposerHub
  onHubChange: (hub: PinComposerHub) => void
  dataSource?: ComposeHubDataSource
  strings: ComposeHubStrings
  liveGitStatus: {
    branch: string | null
    dirty: boolean
    ahead?: number
    behind?: number
    remoteUrl?: string
    defaultBranch?: string
  } | null
  onStatusRefresh?: () => void
  onOpenRepoPicker?: () => void
  onOpenBranchLocator?: () => void
  /**
   * Host for toast / Ask Agent / Graph / auth.
   * Defaults to Workbench Zustand; Overlay passes an IPC-backed host.
   */
  host?: ComposerRepoOpsHost
  /** Optional login label when host does not expose it (Workbench only). */
  githubLogin?: string | null
}

export default function ComposerRepoQuickOps({
  hub,
  onHubChange,
  dataSource,
  strings,
  liveGitStatus,
  onStatusRefresh,
  onOpenRepoPicker,
  onOpenBranchLocator,
  host: hostProp,
  githubLogin: githubLoginProp,
}: Props) {
  const storeConnected = useWorkbenchStore(
    (s) => s.githubAuthStatus?.connected === true,
  )
  const storeLogin = useWorkbenchStore((s) => s.githubAuthStatus?.login ?? null)
  const host = useMemo(
    () => hostProp ?? createWorkbenchComposerRepoOpsHost(storeConnected),
    [hostProp, storeConnected],
  )
  const githubLogin = githubLoginProp ?? storeLogin

  const ops = useComposerRepoOps({
    hub,
    onHubChange,
    dataSource,
    liveGitStatus,
    onStatusRefresh,
    host,
    messages: {
      dirtyBlocked: strings.repoDirtyBlocked,
      connectGithub: strings.repoConnectGithub,
      askAgentStarted: strings.repoAskAgentStarted,
      opFailed: (detail) =>
        strings.repoOpFailed.replace('{detail}', detail),
    },
  })

  if (!hub.repo?.label) {
    return (
      <button
        type="button"
        className={styles.emptyHint}
        onClick={() => onOpenRepoPicker?.()}
      >
        {strings.repoEmpty}
      </button>
    )
  }

  const sync = resolveRepoSyncButtons({
    ahead: liveGitStatus?.ahead,
    behind: liveGitStatus?.behind,
    dirty: liveGitStatus?.dirty,
  })
  const dirty = Boolean(liveGitStatus?.dirty)
  const busy = ops.mutating || ops.recoveryPhase === 'running'
  const hubBranch = hub.repo?.branch ?? null
  const workspaceBranch = liveGitStatus?.branch ?? null
  const pendingCheckout =
    hubBranch && workspaceBranch && hubBranch !== workspaceBranch
      ? hubBranch
      : ops.pendingCheckoutBranch &&
          ops.pendingCheckoutBranch !== workspaceBranch
        ? ops.pendingCheckoutBranch
        : null
  const showCheckout = Boolean(pendingCheckout)

  return (
    <div className={styles.wrap}>
      <div className={styles.identityRow}>
        <button
          type="button"
          className={styles.repoPath}
          onClick={() => onOpenRepoPicker?.()}
        >
          {hub.repo.label}
        </button>
        <button
          type="button"
          className={`${styles.authChip}${ops.githubConnected ? ` ${styles.authChipConnected}` : ''}`}
          onClick={() => {
            if (!ops.githubConnected) void ops.connectGitHub()
          }}
          title={
            ops.githubConnected
              ? `@${githubLogin ?? 'github'}`
              : strings.repoConnectGithub
          }
        >
          {ops.githubConnected
            ? `@${githubLogin ?? 'github'}`
            : strings.repoConnectGithub}
        </button>
      </div>

      {hub.repo.branch || liveGitStatus?.branch ? (
        <button
          type="button"
          className={styles.branchPill}
          onClick={() => onOpenBranchLocator?.()}
          title={strings.repoLocate}
        >
          <GitBranch size={10} strokeWidth={2} aria-hidden />
          {showCheckout && pendingCheckout && workspaceBranch
            ? `${workspaceBranch} → ${pendingCheckout}`
            : (liveGitStatus?.branch ?? hub.repo.branch)}
        </button>
      ) : null}

      {liveGitStatus ? (
        <div className={styles.statusLine}>
          <span>
            {liveGitStatus.dirty ? strings.repoDirty : strings.repoClean}
          </span>
          {liveGitStatus.ahead !== undefined ||
          liveGitStatus.behind !== undefined ? (
            <span>
              ↑{liveGitStatus.ahead ?? 0} ↓{liveGitStatus.behind ?? 0}
            </span>
          ) : null}
          {ops.linkedPr || hub.repo.prNumber ? (
            <span>PR #{ops.linkedPr?.number ?? hub.repo.prNumber}</span>
          ) : null}
        </div>
      ) : null}

      {showCheckout && pendingCheckout ? (
        <div className={styles.pendingRow}>
          <span className={styles.pendingHint}>
            {strings.repoCheckoutPending.replace('{branch}', pendingCheckout)}
          </span>
          <button
            type="button"
            className={styles.actionBtn}
            disabled={busy}
            onClick={() => ops.cancelPendingCheckout()}
          >
            {strings.repoCancel}
          </button>
        </div>
      ) : null}

      {ops.formMode === 'new-branch' ? (
        <form
          className={styles.form}
          onSubmit={(event) => {
            event.preventDefault()
            void ops.submitNewBranch()
          }}
        >
          <div className={styles.formRow}>
            <input
              className={styles.input}
              value={ops.branchDraft}
              placeholder={strings.repoNewBranchPlaceholder}
              aria-label={strings.repoNewBranch}
              autoFocus
              onChange={(event) => ops.setBranchDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault()
                  ops.setFormMode('none')
                }
              }}
            />
            <button
              type="submit"
              className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
              disabled={busy || !ops.branchDraft.trim()}
            >
              {strings.repoCreateBranch}
            </button>
            <button
              type="button"
              className={styles.actionBtn}
              onClick={() => ops.setFormMode('none')}
            >
              {strings.repoCancel}
            </button>
          </div>
        </form>
      ) : null}

      {ops.formMode === 'create-pr' ? (
        <form
          className={styles.form}
          onSubmit={(event) => {
            event.preventDefault()
            void ops.submitCreatePr()
          }}
        >
          <div className={styles.formRow}>
            <input
              className={styles.input}
              value={ops.prTitleDraft}
              placeholder={strings.repoPrTitlePlaceholder}
              aria-label={strings.repoCreatePr}
              autoFocus
              onChange={(event) => ops.setPrTitleDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault()
                  ops.setFormMode('none')
                }
              }}
            />
            <button
              type="submit"
              className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
              disabled={busy || !ops.prTitleDraft.trim()}
            >
              {strings.repoCreatePr}
            </button>
            <button
              type="button"
              className={styles.actionBtn}
              onClick={() => ops.setFormMode('none')}
            >
              {strings.repoCancel}
            </button>
          </div>
        </form>
      ) : null}

      <div className={styles.actionRow}>
        {dirty ? (
          <button
            type="button"
            className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
            disabled={busy}
            onClick={() => ops.askAgentCleanup()}
          >
            {strings.repoAskAgent}
          </button>
        ) : null}
        {showCheckout && pendingCheckout ? (
          <button
            type="button"
            className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
            disabled={busy}
            onClick={() => void ops.runCheckout(pendingCheckout)}
          >
            {strings.repoCheckout}
          </button>
        ) : null}
        {!dirty && sync.showPull ? (
          <button
            type="button"
            className={`${styles.actionBtn}${sync.primary === 'pull' ? ` ${styles.actionBtnPrimary}` : ''}`}
            disabled={busy || !dataSource?.pullBranch}
            onClick={() => void ops.runPull()}
          >
            {strings.repoPull}
          </button>
        ) : null}
        {!dirty && sync.showPush ? (
          <button
            type="button"
            className={`${styles.actionBtn}${sync.primary === 'push' ? ` ${styles.actionBtnPrimary}` : ''}`}
            disabled={busy || !dataSource?.pushBranch}
            onClick={() => void ops.runPush()}
            title={
              ops.githubConnected ? undefined : strings.repoConnectGithub
            }
          >
            {strings.repoPush}
          </button>
        ) : null}
        {dataSource?.fetchGit ? (
          <button
            type="button"
            className={styles.actionBtn}
            disabled={busy}
            onClick={() => void ops.runFetch()}
          >
            {strings.repoFetch}
          </button>
        ) : null}
        {dataSource?.createBranch ? (
          <button
            type="button"
            className={styles.actionBtn}
            disabled={busy}
            onClick={() => {
              ops.setFormMode('new-branch')
              ops.setBranchDraft('')
            }}
          >
            {strings.repoNewBranch}
          </button>
        ) : null}
        {ops.linkedPr ? (
          <button
            type="button"
            className={styles.actionBtn}
            disabled={busy}
            onClick={() => ops.openLinkedPr()}
          >
            {strings.repoViewPr}
          </button>
        ) : dataSource?.createPullRequest ? (
          <button
            type="button"
            className={styles.actionBtn}
            disabled={busy || dirty}
            onClick={() => {
              if (!ops.requireGithubAuth()) return
              ops.setFormMode('create-pr')
              ops.setPrTitleDraft('')
            }}
          >
            {strings.repoCreatePr}
          </button>
        ) : null}
        {dataSource?.openGithubGraph ? (
          <button
            type="button"
            className={styles.actionBtn}
            onClick={() => ops.openGraphFocused()}
          >
            {strings.repoOpenGraph}
          </button>
        ) : null}
        {liveGitStatus?.remoteUrl && dataSource?.openExternalUrl ? (
          <button
            type="button"
            className={styles.actionBtn}
            onClick={() => {
              const url = liveGitStatus.remoteUrl
              if (!url) return
              dataSource.openExternalUrl?.(remoteUrlToHttps(url))
            }}
          >
            <ExternalLink size={11} strokeWidth={2} aria-hidden />
            {strings.repoOpenGithub}
          </button>
        ) : null}
      </div>

      {ops.lastResult ? (
        <button
          type="button"
          className={styles.footer}
          onClick={() => ops.openGraphFocused()}
          title={strings.repoOpenGraph}
        >
          {ops.lastResult}
        </button>
      ) : null}
    </div>
  )
}
