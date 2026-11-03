import { useCallback, useEffect, useRef, useState } from 'react'
import type { PinComposerHub } from '@contracts/spatial-pin'
import {
  buildGithubGraphRecoveryPrompt,
  classifyGithubGraphBlocker,
  type PendingGithubGraphAction,
} from '../GithubGraph/githubGraphAgentRecovery'
import type { ComposerRepoOpsHost } from './composerRepoOpsHost'
import type { ComposeHubDataSource, HubGitStatus } from './hubActions'
import { branchNodeId } from './repoQuickOps'

const RECOVERY_POLL_MS = 2500

export type ComposerRepoFormMode = 'none' | 'new-branch' | 'create-pr'

export interface ComposerRepoLinkedPr {
  number: number
  title: string
  url: string
  headRef: string
  baseRef: string
}

interface Options {
  hub: PinComposerHub
  onHubChange: (hub: PinComposerHub) => void
  dataSource?: ComposeHubDataSource
  liveGitStatus: HubGitStatus | null
  onStatusRefresh?: () => void
  /** Workbench Zustand host or Overlay IPC host. */
  host: ComposerRepoOpsHost
  /** Toast / Ask Agent copy from i18n. */
  messages: {
    dirtyBlocked: string
    connectGithub: string
    askAgentStarted: string
    opFailed: (detail: string) => string
  }
}

function patchRepo(
  hub: PinComposerHub,
  partial: Partial<NonNullable<PinComposerHub['repo']>>,
): PinComposerHub {
  const label = hub.repo?.label ?? partial.label ?? 'repository'
  return {
    ...hub,
    repo: {
      ...hub.repo,
      label,
      ...partial,
    },
  }
}

/**
 * GitHub card quick-ops: mutations, toasts, Graph refresh, Ask Agent recovery.
 */
export function useComposerRepoOps({
  hub,
  onHubChange,
  dataSource,
  liveGitStatus,
  onStatusRefresh,
  host,
  messages,
}: Options) {
  const pushToast = host.pushToast
  const connectGitHub = host.connectGitHub
  const githubConnected = host.githubConnected
  const requestGithubGraphRefresh = host.requestGithubGraphRefresh
  const askAgent = host.askAgent

  const [mutating, setMutating] = useState(false)
  const [formMode, setFormMode] = useState<ComposerRepoFormMode>('none')
  const [branchDraft, setBranchDraft] = useState('')
  const [prTitleDraft, setPrTitleDraft] = useState('')
  const [pendingCheckoutBranch, setPendingCheckoutBranch] = useState<
    string | null
  >(null)
  const [lastResult, setLastResult] = useState<string | null>(null)
  const [linkedPr, setLinkedPr] = useState<ComposerRepoLinkedPr | null>(null)
  const [recoveryPhase, setRecoveryPhase] = useState<'idle' | 'running'>('idle')
  const pendingActionRef = useRef<PendingGithubGraphAction>({ type: 'none' })
  const recoveryStartingRef = useRef(false)

  const currentBranch =
    liveGitStatus?.branch ?? hub.repo?.branch ?? null

  const refreshLinkedPr = useCallback(async () => {
    if (!dataSource?.listPullRequests || !currentBranch) {
      setLinkedPr(null)
      return
    }
    try {
      const listed = await dataSource.listPullRequests()
      if (!listed.available) {
        setLinkedPr(null)
        return
      }
      const match =
        listed.pullRequests.find((pr) => pr.headRef === currentBranch) ?? null
      setLinkedPr(match)
      if (match && hub.repo?.prNumber !== match.number) {
        onHubChange(
          patchRepo(hub, {
            branch: currentBranch,
            prNumber: match.number,
            nodeId: `pr:${match.number}`,
            baseBranch: match.baseRef,
          }),
        )
      }
    } catch {
      setLinkedPr(null)
    }
  }, [currentBranch, dataSource, hub, onHubChange])

  useEffect(() => {
    void refreshLinkedPr()
  }, [refreshLinkedPr])

  const finishOk = useCallback(
    (message: string, focus?: { branch?: string | null; prNumber?: number | null }) => {
      setLastResult(message)
      pushToast({ type: 'success', message })
      onStatusRefresh?.()
      requestGithubGraphRefresh(focus)
      void refreshLinkedPr()
    },
    [
      onStatusRefresh,
      pushToast,
      refreshLinkedPr,
      requestGithubGraphRefresh,
    ],
  )

  const finishErr = useCallback(
    (message: string) => {
      setLastResult(message)
      pushToast({ type: 'error', message: messages.opFailed(message) })
    },
    [messages, pushToast],
  )

  const startAgentRecovery = useCallback(
    async (
      blockerMessage: string,
      pending: PendingGithubGraphAction = { type: 'none' },
    ) => {
      const kind = classifyGithubGraphBlocker(blockerMessage)
      if (!kind) {
        finishErr(blockerMessage)
        return
      }
      pendingActionRef.current = pending
      if (recoveryStartingRef.current || recoveryPhase === 'running') {
        return
      }
      recoveryStartingRef.current = true
      setRecoveryPhase('running')
      const prompt = buildGithubGraphRecoveryPrompt({
        kind,
        blockerMessage,
        pending,
        defaultBranch: liveGitStatus?.defaultBranch ?? null,
      })
      pushToast({ type: 'info', message: messages.askAgentStarted })
      try {
        await askAgent(prompt)
      } finally {
        recoveryStartingRef.current = false
      }
    },
    [
      askAgent,
      finishErr,
      liveGitStatus?.defaultBranch,
      messages.askAgentStarted,
      pushToast,
      recoveryPhase,
    ],
  )

  useEffect(() => {
    if (recoveryPhase !== 'running' || !dataSource?.getGitStatus) return
    let cancelled = false
    const timer = window.setInterval(() => {
      void (async () => {
        try {
          const status = await dataSource.getGitStatus!()
          if (cancelled || status.dirty) return
          const pending = pendingActionRef.current
          pendingActionRef.current = { type: 'none' }
          setRecoveryPhase('idle')
          if (pending.type === 'checkout' && dataSource.checkoutBranch) {
            setMutating(true)
            try {
              const result = await dataSource.checkoutBranch(pending.branch)
              if (result.ok) {
                onHubChange(
                  patchRepo(hub, {
                    branch: pending.branch,
                    nodeId: pending.nodeId,
                  }),
                )
                finishOk(result.message, { branch: pending.branch })
              } else {
                finishErr(result.message)
              }
            } finally {
              setMutating(false)
            }
          } else if (pending.type === 'push' && dataSource.pushBranch) {
            setMutating(true)
            try {
              const result = await dataSource.pushBranch(pending.branch)
              if (result.ok) finishOk(result.message, { branch: pending.branch })
              else finishErr(result.message)
            } finally {
              setMutating(false)
            }
          } else if (pending.type === 'pull' && dataSource.pullBranch) {
            setMutating(true)
            try {
              const result = await dataSource.pullBranch(pending.branch)
              if (result.ok) finishOk(result.message, { branch: pending.branch })
              else finishErr(result.message)
            } finally {
              setMutating(false)
            }
          } else {
            onStatusRefresh?.()
          }
        } catch {
          /* keep polling */
        }
      })()
    }, RECOVERY_POLL_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [
    dataSource,
    finishErr,
    finishOk,
    hub,
    onHubChange,
    onStatusRefresh,
    recoveryPhase,
  ])

  const noteOutcome = useCallback(
    (
      result: { ok: boolean; message: string },
      pending: PendingGithubGraphAction,
      focus?: { branch?: string | null; prNumber?: number | null },
    ) => {
      if (result.ok) {
        finishOk(result.message, focus)
        return
      }
      if (classifyGithubGraphBlocker(result.message)) {
        void startAgentRecovery(result.message, pending)
        return
      }
      finishErr(result.message)
    },
    [finishErr, finishOk, startAgentRecovery],
  )

  const requireClean = useCallback(
    (pending: PendingGithubGraphAction): boolean => {
      if (!liveGitStatus?.dirty) return true
      void startAgentRecovery(messages.dirtyBlocked, pending)
      return false
    },
    [liveGitStatus?.dirty, messages.dirtyBlocked, startAgentRecovery],
  )

  const requireGithubAuth = useCallback((): boolean => {
    if (githubConnected) return true
    pushToast({ type: 'warning', message: messages.connectGithub })
    void connectGitHub()
    return false
  }, [connectGitHub, githubConnected, messages.connectGithub, pushToast])

  const runFetch = useCallback(async () => {
    if (!dataSource?.fetchGit || mutating) return
    setMutating(true)
    try {
      const result = await dataSource.fetchGit()
      noteOutcome(result, { type: 'none' }, { branch: currentBranch })
    } finally {
      setMutating(false)
    }
  }, [currentBranch, dataSource, mutating, noteOutcome])

  const runPull = useCallback(async () => {
    if (!dataSource?.pullBranch || !currentBranch || mutating) return
    if (!requireClean({ type: 'pull', branch: currentBranch })) return
    setMutating(true)
    try {
      const result = await dataSource.pullBranch(currentBranch)
      noteOutcome(result, { type: 'pull', branch: currentBranch }, {
        branch: currentBranch,
      })
    } finally {
      setMutating(false)
    }
  }, [currentBranch, dataSource, mutating, noteOutcome, requireClean])

  const runPush = useCallback(async () => {
    if (!dataSource?.pushBranch || !currentBranch || mutating) return
    if (!requireGithubAuth()) return
    if (!requireClean({ type: 'push', branch: currentBranch })) return
    setMutating(true)
    try {
      const result = await dataSource.pushBranch(currentBranch)
      noteOutcome(result, { type: 'push', branch: currentBranch }, {
        branch: currentBranch,
      })
    } finally {
      setMutating(false)
    }
  }, [
    currentBranch,
    dataSource,
    mutating,
    noteOutcome,
    requireClean,
    requireGithubAuth,
  ])

  const runCheckout = useCallback(
    async (branch: string) => {
      if (!dataSource?.checkoutBranch || mutating) return
      const nodeId = branchNodeId(branch)
      if (!requireClean({ type: 'checkout', branch, nodeId })) return
      setMutating(true)
      try {
        const result = await dataSource.checkoutBranch(branch)
        if (result.ok) {
          onHubChange(
            patchRepo(hub, {
              branch,
              nodeId,
              prNumber: undefined,
            }),
          )
          setPendingCheckoutBranch(null)
        }
        noteOutcome(result, { type: 'checkout', branch, nodeId }, { branch })
      } finally {
        setMutating(false)
      }
    },
    [dataSource, hub, mutating, noteOutcome, onHubChange, requireClean],
  )

  /** Discard locator target and re-bind hub.repo to the workspace HEAD. */
  const cancelPendingCheckout = useCallback(() => {
    const workspace = liveGitStatus?.branch
    setPendingCheckoutBranch(null)
    if (!workspace) {
      if (hub.repo) {
        onHubChange({
          ...hub,
          repo: { label: hub.repo.label },
        })
      }
      return
    }
    onHubChange(
      patchRepo(hub, {
        branch: workspace,
        nodeId: branchNodeId(workspace),
        prNumber: undefined,
      }),
    )
  }, [hub, liveGitStatus?.branch, onHubChange])

  const submitNewBranch = useCallback(async () => {
    const name = branchDraft.trim()
    if (!dataSource?.createBranch || !name || mutating) return
    if (!requireClean({ type: 'checkout', branch: name, nodeId: branchNodeId(name) })) {
      return
    }
    setMutating(true)
    try {
      const result = await dataSource.createBranch({
        name,
        from: currentBranch ?? undefined,
        checkout: true,
      })
      if (result.ok) {
        onHubChange(
          patchRepo(hub, {
            branch: name,
            nodeId: branchNodeId(name),
            prNumber: undefined,
          }),
        )
        setFormMode('none')
        setBranchDraft('')
      }
      noteOutcome(
        result,
        { type: 'checkout', branch: name, nodeId: branchNodeId(name) },
        { branch: name },
      )
    } finally {
      setMutating(false)
    }
  }, [
    branchDraft,
    currentBranch,
    dataSource,
    hub,
    mutating,
    noteOutcome,
    onHubChange,
    requireClean,
  ])

  const submitCreatePr = useCallback(async () => {
    const title = prTitleDraft.trim()
    if (!dataSource?.createPullRequest || !title || mutating) return
    if (!requireGithubAuth()) return
    setMutating(true)
    try {
      const result = await dataSource.createPullRequest({
        title,
        head: currentBranch ?? undefined,
        base: liveGitStatus?.defaultBranch ?? undefined,
      })
      if (result.ok) {
        if (result.number) {
          onHubChange(
            patchRepo(hub, {
              branch: currentBranch ?? hub.repo?.branch,
              prNumber: result.number,
              nodeId: `pr:${result.number}`,
              baseBranch: liveGitStatus?.defaultBranch ?? undefined,
            }),
          )
        }
        setFormMode('none')
        setPrTitleDraft('')
        if (result.url) {
          dataSource.openExternalUrl?.(result.url)
        }
        finishOk(result.message, {
          branch: currentBranch,
          prNumber: result.number ?? null,
        })
      } else {
        finishErr(result.message)
      }
    } finally {
      setMutating(false)
    }
  }, [
    currentBranch,
    dataSource,
    finishErr,
    finishOk,
    hub,
    liveGitStatus?.defaultBranch,
    mutating,
    onHubChange,
    prTitleDraft,
    requireGithubAuth,
  ])

  const askAgentCleanup = useCallback(() => {
    void startAgentRecovery(messages.dirtyBlocked, { type: 'none' })
  }, [messages.dirtyBlocked, startAgentRecovery])

  const openLinkedPr = useCallback(() => {
    if (linkedPr?.url) {
      dataSource?.openExternalUrl?.(linkedPr.url)
      return
    }
    if (hub.repo?.prNumber && liveGitStatus?.remoteUrl) {
      /* open Graph focused instead */
    }
  }, [dataSource, hub.repo?.prNumber, linkedPr, liveGitStatus?.remoteUrl])

  const openGraphFocused = useCallback(() => {
    dataSource?.openGithubGraph?.({
      branch: currentBranch,
      prNumber: linkedPr?.number ?? hub.repo?.prNumber ?? null,
    })
  }, [currentBranch, dataSource, hub.repo?.prNumber, linkedPr?.number])

  return {
    mutating,
    recoveryPhase,
    formMode,
    setFormMode,
    branchDraft,
    setBranchDraft,
    prTitleDraft,
    setPrTitleDraft,
    pendingCheckoutBranch,
    setPendingCheckoutBranch,
    lastResult,
    linkedPr,
    githubConnected,
    currentBranch,
    runFetch,
    runPull,
    runPush,
    runCheckout,
    cancelPendingCheckout,
    submitNewBranch,
    submitCreatePr,
    askAgentCleanup,
    openLinkedPr,
    openGraphFocused,
    requireGithubAuth,
    connectGitHub,
  }
}
