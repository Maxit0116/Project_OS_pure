import { useEffect, useMemo, useState } from 'react'
import { ChevronRight, Folder, GitBranch, Search, X } from 'lucide-react'
import type { PinComposerHub } from '@contracts/spatial-pin'
import type { WorkspaceGitBranch } from '@contracts/workspace-git'
import type { ComposeHubDataSource } from './hubActions'
import type { ComposeHubStrings } from './composeHubStrings'
import {
  buildGithubBranchTree,
  childrenAtPath,
  filterBranchesByQuery,
  type GithubBranchTreeNode,
} from './githubBranchTree'
import type { SatelliteRect } from './hubLayout'
import styles from './GithubBranchLocator.module.css'

interface Props {
  open: boolean
  anchorRect: SatelliteRect
  hub: PinComposerHub
  onHubChange: (hub: PinComposerHub) => void
  strings: ComposeHubStrings
  dataSource?: ComposeHubDataSource
  onClose: () => void
}

export default function GithubBranchLocator({
  open,
  anchorRect,
  hub,
  onHubChange,
  strings,
  dataSource,
  onClose,
}: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [branches, setBranches] = useState<WorkspaceGitBranch[]>([])
  const [query, setQuery] = useState('')
  const [path, setPath] = useState<string[]>([])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    setError(null)
    void (async () => {
      try {
        const listed = await dataSource?.listGitBranches?.()
        if (cancelled) return
        setBranches(listed?.branches ?? [])
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : strings.repoLocateError)
        setBranches([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, dataSource, strings.repoLocateError])

  useEffect(() => {
    if (!open) {
      setQuery('')
      setPath([])
    }
  }, [open])

  const tree = useMemo(() => buildGithubBranchTree(branches), [branches])
  const filtered = useMemo(
    () => filterBranchesByQuery(branches, query),
    [branches, query],
  )
  const browsing = query.trim().length === 0
  const visible: GithubBranchTreeNode[] = browsing
    ? childrenAtPath(tree, path)
    : filtered.map((branch) => ({
        kind: 'branch' as const,
        id: branch.id,
        name: branch.name,
        fullName: branch.name,
        current: branch.current,
        remote: branch.remote,
        ...(branch.ahead !== undefined ? { ahead: branch.ahead } : {}),
        ...(branch.behind !== undefined ? { behind: branch.behind } : {}),
      }))

  function selectBranch(fullName: string, nodeId: string) {
    const label = hub.repo?.label ?? 'repository'
    onHubChange({
      ...hub,
      repo: {
        ...hub.repo,
        label,
        branch: fullName,
        nodeId,
        ...(hub.repo?.baseBranch ? { baseBranch: hub.repo.baseBranch } : {}),
        ...(hub.repo?.prNumber ? { prNumber: hub.repo.prNumber } : {}),
        ...(hub.repo?.worktreeId ? { worktreeId: hub.repo.worktreeId } : {}),
      },
    })
    onClose()
  }

  if (!open) return null

  const left =
    anchorRect.side === 'left'
      ? Math.max(8, anchorRect.x - 8)
      : Math.max(8, anchorRect.x + anchorRect.width + 8)

  return (
    <div
      className={styles.panel}
      style={{
        left,
        top: Math.max(8, anchorRect.y),
      }}
      role="dialog"
      aria-label={strings.repoLocate}
    >
      <div className={styles.header}>
        <span className={styles.title}>{strings.repoLocate}</span>
        <button
          type="button"
          className={styles.closeBtn}
          aria-label={strings.referencesClosePanel}
          onClick={onClose}
        >
          <X size={14} strokeWidth={2} aria-hidden />
        </button>
      </div>
      <label className={styles.header}>
        <Search size={12} strokeWidth={2} aria-hidden />
        <input
          className={styles.search}
          value={query}
          placeholder={strings.repoLocateSearch}
          aria-label={strings.repoLocateSearch}
          onChange={(event) => {
            setQuery(event.target.value)
            setPath([])
          }}
        />
      </label>
      {browsing ? (
        <div className={styles.crumbs}>
          <button
            type="button"
            className={styles.crumb}
            onClick={() => setPath([])}
          >
            {strings.repoLocateRoot}
          </button>
          {path.map((segment, index) => (
            <span key={`${segment}-${index}`}>
              <ChevronRight size={10} strokeWidth={2} aria-hidden />
              <button
                type="button"
                className={styles.crumb}
                onClick={() => setPath(path.slice(0, index + 1))}
              >
                {segment}
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <div className={styles.list}>
        {loading ? (
          <div className={styles.empty}>{strings.repoLocateLoading}</div>
        ) : error ? (
          <div className={styles.empty}>{error}</div>
        ) : visible.length === 0 ? (
          <div className={styles.empty}>{strings.repoLocateEmpty}</div>
        ) : (
          visible.map((node) => {
            if (node.kind === 'folder') {
              return (
                <button
                  key={node.id}
                  type="button"
                  className={styles.row}
                  onClick={() => setPath([...path, node.name])}
                >
                  <Folder size={12} strokeWidth={2} aria-hidden />
                  <span>{node.name}</span>
                  <ChevronRight
                    size={12}
                    strokeWidth={2}
                    className={styles.meta}
                    aria-hidden
                  />
                </button>
              )
            }
            return (
              <button
                key={node.id}
                type="button"
                className={`${styles.row}${node.current ? ` ${styles.rowCurrent}` : ''}`}
                onClick={() => selectBranch(node.fullName, node.id)}
              >
                <GitBranch size={12} strokeWidth={2} aria-hidden />
                <span>{browsing ? node.name : node.fullName}</span>
                <span className={styles.meta}>
                  {node.current ? strings.repoCurrent : node.remote ? 'remote' : ''}
                  {node.ahead !== undefined || node.behind !== undefined
                    ? ` ↑${node.ahead ?? 0} ↓${node.behind ?? 0}`
                    : ''}
                </span>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
