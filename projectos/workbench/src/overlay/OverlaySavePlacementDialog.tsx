import { useEffect, useMemo, useState } from 'react'
import type {
  SpatialCaptureFolder,
  SpatialCapturePlacement,
  SpatialCaptureSessionHead,
} from '@contracts/spatial-capture-session'
import {
  nextCaptureVersionTitle,
  partitionSpatialCaptures,
} from '@contracts/spatial-capture-session'

export type PlacementMode = SpatialCapturePlacement['mode']

interface Props {
  open: boolean
  projectId: string | null
  onCancel: () => void
  onConfirm: (placement: SpatialCapturePlacement) => void
}

const MODE_OPTIONS: Array<{ id: PlacementMode; label: string }> = [
  { id: 'misc', label: 'Save to Misc' },
  { id: 'new_folder', label: 'New folder' },
  { id: 'join_folder', label: 'Add to folder' },
  { id: 'merge_misc', label: 'Merge with Misc capture' },
]

export default function OverlaySavePlacementDialog({
  open,
  projectId,
  onCancel,
  onConfirm,
}: Props) {
  const [mode, setMode] = useState<PlacementMode>('misc')
  const [title, setTitle] = useState('')
  const [folderName, setFolderName] = useState('')
  const [joinFolderId, setJoinFolderId] = useState('')
  const [mergeSessionId, setMergeSessionId] = useState('')
  const [folders, setFolders] = useState<SpatialCaptureFolder[]>([])
  const [heads, setHeads] = useState<SpatialCaptureSessionHead[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    setMode('misc')
    setTitle('')
    setFolderName('')
    setJoinFolderId('')
    setMergeSessionId('')
    if (!projectId || !window.projectOS) {
      setFolders([])
      setHeads([])
      return
    }
    let cancelled = false
    setLoading(true)
    void (async () => {
      try {
        const [nextFolders, nextHeads] = await Promise.all([
          window.projectOS!.invoke(
            'listSpatialCaptureFolders',
            projectId,
          ) as Promise<SpatialCaptureFolder[]>,
          window.projectOS!.invoke(
            'listSpatialCaptureSessions',
            projectId,
          ) as Promise<SpatialCaptureSessionHead[]>,
        ])
        if (cancelled) return
        setFolders(nextFolders)
        setHeads(nextHeads)
        if (nextFolders[0]) setJoinFolderId(nextFolders[0].id)
        const misc = partitionSpatialCaptures(nextHeads, nextFolders).misc.filter(
          (head) => !head.folderId,
        )
        if (misc[0]) setMergeSessionId(misc[0].id)
      } catch {
        if (!cancelled) {
          setFolders([])
          setHeads([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, projectId])

  const miscUnfiled = useMemo(
    () =>
      partitionSpatialCaptures(heads, folders).misc.filter(
        (head) => !head.folderId,
      ),
    [heads, folders],
  )

  const selectedFolder = folders.find((folder) => folder.id === joinFolderId)

  useEffect(() => {
    if (!open) return
    if (mode === 'new_folder' && folderName.trim()) {
      setTitle(nextCaptureVersionTitle(folderName.trim(), []))
      return
    }
    if (mode === 'join_folder' && selectedFolder) {
      const existing = selectedFolder.memberSessionIds
        .map(
          (id) => heads.find((head) => head.id === id)?.title?.trim() || '',
        )
        .filter(Boolean)
      setTitle(nextCaptureVersionTitle(selectedFolder.name, existing))
      return
    }
    if (mode === 'merge_misc' && folderName.trim()) {
      setTitle(nextCaptureVersionTitle(folderName.trim(), [
        nextCaptureVersionTitle(folderName.trim(), []),
      ]))
    }
  }, [open, mode, folderName, selectedFolder, heads])

  function buildPlacement(): SpatialCapturePlacement | null {
    const trimmedTitle = title.trim()
    if (mode === 'misc') {
      return { mode: 'misc', title: trimmedTitle }
    }
    if (mode === 'new_folder') {
      const name = folderName.trim()
      if (!name) return null
      return {
        mode: 'new_folder',
        folderName: name,
        title: trimmedTitle || nextCaptureVersionTitle(name, []),
      }
    }
    if (mode === 'join_folder') {
      if (!joinFolderId) return null
      return {
        mode: 'join_folder',
        folderId: joinFolderId,
        title: trimmedTitle,
      }
    }
    const name = folderName.trim()
    if (!mergeSessionId || !name) return null
    return {
      mode: 'merge_misc',
      otherSessionId: mergeSessionId,
      folderName: name,
      title: trimmedTitle || nextCaptureVersionTitle(name, [
        nextCaptureVersionTitle(name, []),
      ]),
      otherTitle: nextCaptureVersionTitle(name, []),
    }
  }

  const placement = buildPlacement()
  const canSave = Boolean(placement) && !loading

  if (!open) return null

  return (
    <div
      className="overlay-save-prompt"
      role="dialog"
      aria-modal="true"
      aria-labelledby="overlay-save-prompt-title"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="overlay-save-prompt-card overlay-save-prompt-card-wide">
        <h2 id="overlay-save-prompt-title">Save to Spatial Captures</h2>
        <p>
          Finished regions (selection, arrow, and compose card) can be kept. A
          selection by itself is discarded. Folders appear in the gallery once
          they have two or more captures.
        </p>

        <label className="overlay-save-field">
          <span>Placement</span>
          <select
            value={mode}
            onChange={(event) => setMode(event.target.value as PlacementMode)}
          >
            {MODE_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        {(mode === 'new_folder' || mode === 'merge_misc') && (
          <label className="overlay-save-field">
            <span>Folder name</span>
            <input
              value={folderName}
              onChange={(event) => setFolderName(event.target.value)}
              placeholder="LoginUX"
              autoFocus
            />
          </label>
        )}

        {mode === 'join_folder' && (
          <label className="overlay-save-field">
            <span>Folder</span>
            <select
              value={joinFolderId}
              onChange={(event) => setJoinFolderId(event.target.value)}
              disabled={folders.length === 0}
            >
              {folders.length === 0 ? (
                <option value="">No folders yet</option>
              ) : (
                folders.map((folder) => (
                  <option key={folder.id} value={folder.id}>
                    {folder.name} ({folder.memberSessionIds.length})
                  </option>
                ))
              )}
            </select>
          </label>
        )}

        {mode === 'merge_misc' && (
          <label className="overlay-save-field">
            <span>Misc capture</span>
            <select
              value={mergeSessionId}
              onChange={(event) => setMergeSessionId(event.target.value)}
              disabled={miscUnfiled.length === 0}
            >
              {miscUnfiled.length === 0 ? (
                <option value="">No unfiled Misc captures</option>
              ) : (
                miscUnfiled.map((head) => (
                  <option key={head.id} value={head.id}>
                    {head.title || head.id}
                  </option>
                ))
              )}
            </select>
          </label>
        )}

        <label className="overlay-save-field">
          <span>Capture name</span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={
              mode === 'misc'
                ? 'Optional title'
                : 'e.g. LoginUX-1'
            }
          />
        </label>

        <div className="overlay-save-prompt-actions">
          <button
            type="button"
            className="overlay-save-prompt-btn"
            onClick={onCancel}
          >
            Don&apos;t save
          </button>
          <button
            type="button"
            className="overlay-save-prompt-btn overlay-save-prompt-btn-primary"
            disabled={!canSave}
            onClick={() => {
              if (placement) onConfirm(placement)
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
