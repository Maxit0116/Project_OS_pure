import { useEffect, useMemo, useState } from 'react'
import { Camera, FolderInput, Layers } from 'lucide-react'
import {
  nextCaptureVersionTitle,
  partitionSpatialCaptures,
} from '@contracts/spatial-capture-session'
import { useI18n } from '../../i18n'
import { useSpatialCaptureStore } from '../../state/spatialCaptureStore'
import { useWorkbenchStore } from '../../state/workbenchStore'
import { useCaptureFolderDnD } from './CaptureFolderDnDContext'
import dndStyles from './CaptureFolderDnD.module.css'
import TextInput from '../ui/TextInput'
import styles from './CaptureMiscSidebar.module.css'

export default function CaptureMiscSidebar() {
  const { ts } = useI18n()
  const projectId = useWorkbenchStore((s) => s.project?.projectId)
  const client = useWorkbenchStore((s) => s.client)
  const heads = useSpatialCaptureStore((s) => s.heads)
  const folders = useSpatialCaptureStore((s) => s.folders)
  const loadHeads = useSpatialCaptureStore((s) => s.loadHeads)
  const openSession = useSpatialCaptureStore((s) => s.openSession)
  const deleteSession = useSpatialCaptureStore((s) => s.deleteSession)
  const placeSession = useSpatialCaptureStore((s) => s.placeSession)
  const {
    drag,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    consumeClickSuppression,
    isDropActive,
  } = useCaptureFolderDnD()
  const [thumbs, setThumbs] = useState<Record<string, string>>({})
  const [mergeFromId, setMergeFromId] = useState<string | null>(null)
  const [mergeFolderName, setMergeFolderName] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)

  const misc = useMemo(
    () => partitionSpatialCaptures(heads, folders).misc,
    [heads, folders],
  )

  const joinableFolders = folders
  const miscDropActive =
    isDropActive('misc') ||
    (drag?.source === 'folder' && drag.target?.kind === 'session')

  useEffect(() => {
    void loadHeads()
  }, [loadHeads, projectId])

  useEffect(() => {
    if (!client || !projectId) return
    let cancelled = false
    void (async () => {
      const next: Record<string, string> = {}
      for (const head of misc) {
        if (!head.thumbnailAssetPath) continue
        try {
          const asset = await client.readProjectAssetBase64(
            projectId,
            head.thumbnailAssetPath,
          )
          if (asset && !cancelled) {
            next[head.id] = `data:${asset.mimeType};base64,${asset.base64}`
          }
        } catch {
          /* skip */
        }
      }
      if (!cancelled) setThumbs(next)
    })()
    return () => {
      cancelled = true
    }
  }, [client, projectId, misc])

  async function mergeInto(otherId: string) {
    if (!mergeFromId || mergeFromId === otherId) return
    const name = mergeFolderName.trim()
    if (!name) {
      setActionError(ts('spatialCaptures.folderNameRequired'))
      return
    }
    const from = heads.find((h) => h.id === mergeFromId)
    // Prefer joining a latent singleton folder when the target already has one.
    if (from?.folderId) {
      const result = await placeSession(otherId, {
        mode: 'join_folder',
        folderId: from.folderId,
        title: '',
      })
      setActionError(result.ok ? null : (result.error ?? ts('spatialCaptures.loadError')))
      setMergeFromId(null)
      setMergeFolderName('')
      return
    }
    const other = heads.find((h) => h.id === otherId)
    if (other?.folderId) {
      const result = await placeSession(mergeFromId, {
        mode: 'join_folder',
        folderId: other.folderId,
        title: '',
      })
      setActionError(result.ok ? null : (result.error ?? ts('spatialCaptures.loadError')))
      setMergeFromId(null)
      setMergeFolderName('')
      return
    }
    const result = await placeSession(mergeFromId, {
      mode: 'merge_misc',
      otherSessionId: otherId,
      folderName: name,
      title: nextCaptureVersionTitle(name, [nextCaptureVersionTitle(name, [])]),
      otherTitle: nextCaptureVersionTitle(name, []),
    })
    setActionError(result.ok ? null : (result.error ?? ts('spatialCaptures.loadError')))
    setMergeFromId(null)
    setMergeFolderName('')
  }

  async function addToFolder(sessionId: string, folderId: string) {
    const result = await placeSession(sessionId, {
      mode: 'join_folder',
      folderId,
      title: '',
    })
    setActionError(result.ok ? null : (result.error ?? ts('spatialCaptures.loadError')))
  }

  return (
    <div
      className={`${styles.panel} ${miscDropActive ? dndStyles.dropActiveStrong : ''}`}
      data-tour="capture-misc-body"
      data-capture-drop="misc"
    >
      <div className={styles.header}>
        <span className={styles.countLabel}>{ts('spatialCaptures.miscCount')}</span>
        <span className={styles.count}>{misc.length}</span>
      </div>
      <p className={styles.hint}>{ts('spatialCaptures.miscHint')}</p>
      {actionError ? <p className={styles.error}>{actionError}</p> : null}
      {misc.length === 0 ? (
        <div className={styles.empty}>
          <Camera size={14} aria-hidden />
          <span>{ts('spatialCaptures.miscEmpty')}</span>
        </div>
      ) : (
        <ul className={styles.list}>
          {misc.map((head) => {
            const sessionDropActive =
              drag?.source === 'misc' && isDropActive('session', head.id)
            const lifting = drag?.sessionId === head.id
            return (
              <li
                key={head.id}
                className={`${styles.item} ${sessionDropActive ? dndStyles.dropActiveStrong : ''} ${lifting ? styles.lifting : ''}`}
                data-capture-drop="session"
                data-session-id={head.id}
                onPointerDown={(event) =>
                  onPointerDown(event, {
                    sessionId: head.id,
                    title: head.title?.trim() || ts('spatialCaptures.sessionUntitled'),
                    source: 'misc',
                  })
                }
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
              >
                <button
                  type="button"
                  className={styles.thumb}
                  style={
                    thumbs[head.id]
                      ? { backgroundImage: `url(${thumbs[head.id]})` }
                      : undefined
                  }
                  aria-label={head.title}
                  onClick={() => {
                    if (consumeClickSuppression()) return
                    void openSession(head.id)
                  }}
                />
                <div className={styles.meta}>
                  <div className={styles.itemTitle}>{head.title}</div>
                  <div className={styles.actions} data-capture-drag-ignore="">
                    <button
                      type="button"
                      className={styles.action}
                      onClick={() => void openSession(head.id)}
                    >
                      {ts('spatialCaptures.open')}
                    </button>
                    <button
                      type="button"
                      className={styles.action}
                      onClick={() => {
                        setMergeFromId((current) =>
                          current === head.id ? null : head.id,
                        )
                        setMergeFolderName('')
                      }}
                    >
                      <Layers size={12} aria-hidden />
                      {ts('spatialCaptures.merge')}
                    </button>
                    <button
                      type="button"
                      className={`${styles.action} ${styles.danger}`}
                      onClick={() => {
                        void deleteSession(head.id).then((result) => {
                          setActionError(
                            result.ok
                              ? null
                              : (result.error ?? ts('spatialCaptures.deleteBlocked')),
                          )
                        })
                      }}
                    >
                      {ts('spatialCaptures.delete')}
                    </button>
                  </div>
                  {mergeFromId === head.id ? (
                    <div className={styles.mergeBox} data-capture-drag-ignore="">
                      <TextInput
                        className={styles.mergeInput}
                        value={mergeFolderName}
                        onChange={(event) => setMergeFolderName(event.target.value)}
                        placeholder={ts('spatialCaptures.folderNamePlaceholder')}
                        aria-label={ts('spatialCaptures.folderNamePlaceholder')}
                      />
                      <p className={styles.mergeHint}>
                        {ts('spatialCaptures.mergePickHint')}
                      </p>
                      <div className={styles.mergeTargets}>
                        {misc
                          .filter((other) => other.id !== head.id)
                          .map((other) => (
                            <button
                              key={other.id}
                              type="button"
                              className={styles.mergeTarget}
                              onClick={() => void mergeInto(other.id)}
                            >
                              {other.title}
                            </button>
                          ))}
                      </div>
                      {joinableFolders.length > 0 ? (
                        <div className={styles.joinRow}>
                          <FolderInput size={12} aria-hidden />
                          <select
                            className={styles.joinSelect}
                            defaultValue=""
                            onChange={(event) => {
                              const folderId = event.target.value
                              if (!folderId) return
                              void addToFolder(head.id, folderId)
                              event.target.value = ''
                            }}
                          >
                            <option value="">
                              {ts('spatialCaptures.addToFolder')}
                            </option>
                            {joinableFolders.map((folder) => (
                              <option key={folder.id} value={folder.id}>
                                {folder.name} ({folder.memberSessionIds.length})
                              </option>
                            ))}
                          </select>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
