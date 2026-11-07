import { FolderPlus, Plus, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  PinComposerHub,
  PinComposerHubReference,
  PinComposerHubReferenceFolder,
} from '@contracts/spatial-pin'
import {
  createHubReferenceFromInput,
  createHubReferenceFromPickedFile,
} from '@contracts/hub-references'
import type { ComposeHubStrings } from './composeHubStrings'
import type { ComposeHubDataSource } from './hubActions'
import {
  filterReferencesForTab,
  isLinksLibraryRef,
  isRepoLibraryRef,
  REFERENCE_FILE_TYPES,
  REFERENCE_MEDIA_TYPES,
  type ReferenceLibraryTab,
  referenceSourcePath,
} from './referenceCatalog'
import styles from './hubMotion.module.css'

interface Props {
  open: boolean
  anchorRect: { x: number; y: number; width: number; height: number }
  hub: PinComposerHub
  onHubChange: (next: PinComposerHub) => void
  strings: ComposeHubStrings
  dataSource?: ComposeHubDataSource
  onClose: () => void
  onRemoveReference: (id: string) => void
}

function referenceLabel(ref: PinComposerHubReference): string {
  if (ref.label) return ref.label
  const source = referenceSourcePath(ref)
  return source.split('/').pop() ?? source
}

export default function ReferenceAddPanel({
  open,
  anchorRect,
  hub,
  onHubChange,
  strings,
  dataSource,
  onClose,
  onRemoveReference,
}: Props) {
  const panelRef = useRef<HTMLDivElement | null>(null)
  const [draft, setDraft] = useState('')
  const [tab, setTab] = useState<ReferenceLibraryTab>('files')
  const [typeFilter, setTypeFilter] = useState<string | null>(null)
  const [folderId, setFolderId] = useState<string | null>(null)
  const [typeMenuOpen, setTypeMenuOpen] = useState(false)
  const [folderDraft, setFolderDraft] = useState('')
  const [picking, setPicking] = useState(false)

  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      if (panelRef.current?.contains(event.target as Node)) return
      onClose()
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('pointerdown', onPointer, true)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  useEffect(() => {
    setTypeFilter(null)
    setFolderId(null)
    setTypeMenuOpen(false)
    setFolderDraft('')
  }, [tab])

  const referenceFolders = hub.referenceFolders ?? []

  const foldersForTab = useMemo(() => {
    if (tab !== 'links' && tab !== 'repo') return []
    return referenceFolders.filter((folder) => folder.category === tab)
  }, [referenceFolders, tab])

  const visibleRefs = useMemo(
    () =>
      filterReferencesForTab(hub.references, tab, typeFilter, folderId),
    [hub.references, tab, typeFilter, folderId],
  )

  if (!open) return null

  // Sit beside the main References card so vertical growth of that card
  // does not push or collide with this library panel.
  const PANEL_WIDTH = 320
  const GAP = 12
  const preferRight = anchorRect.x + anchorRect.width + GAP
  const viewportWidth =
    typeof window !== 'undefined' ? window.innerWidth : preferRight + PANEL_WIDTH
  const fitsRight = preferRight + PANEL_WIDTH <= viewportWidth - 8
  const left = fitsRight
    ? preferRight
    : Math.max(8, anchorRect.x - GAP - PANEL_WIDTH)
  const top = Math.max(8, anchorRect.y)

  function patch(partial: Partial<PinComposerHub>) {
    onHubChange({ ...hub, ...partial })
  }

  function addCreated(created: PinComposerHubReference) {
    const duplicate = hub.references.some((ref) => {
      if (ref.kind !== created.kind) return false
      if (ref.kind === 'file' && created.kind === 'file') {
        return ref.path === created.path
      }
      if (
        (ref.kind === 'url' || ref.kind === 'github') &&
        (created.kind === 'url' || created.kind === 'github')
      ) {
        return ref.url === created.url
      }
      if (
        (ref.kind === 'image' ||
          ref.kind === 'video' ||
          ref.kind === 'audio') &&
        ref.kind === created.kind
      ) {
        return (
          (ref.assetPath &&
            'assetPath' in created &&
            ref.assetPath === created.assetPath) ||
          (ref.url && created.url && ref.url === created.url)
        )
      }
      return false
    })
    if (duplicate) return
    patch({ references: [...hub.references, created] })
  }

  function addFromDraft() {
    const activeFolder =
      (tab === 'links' || tab === 'repo') &&
      folderId &&
      folderId !== '__unfiled__'
        ? folderId
        : undefined
    const created = createHubReferenceFromInput(draft, undefined, {
      folderId: activeFolder,
    })
    if (!created) return
    addCreated(created as PinComposerHubReference)
    setDraft('')
  }

  async function addFromFinder() {
    const pick = dataSource?.pickReferenceFiles
    if (!pick) return
    setPicking(true)
    try {
      const extensions =
        typeFilter != null
          ? typeFilter === 'jpg'
            ? ['jpg', 'jpeg']
            : [typeFilter]
          : tab === 'files'
            ? [...REFERENCE_FILE_TYPES]
            : tab === 'media'
              ? [...REFERENCE_MEDIA_TYPES]
              : undefined
      const files = await pick(extensions ? { extensions } : undefined)
      for (const file of files) {
        addCreated(
          createHubReferenceFromPickedFile(file) as PinComposerHubReference,
        )
      }
    } finally {
      setPicking(false)
    }
  }

  function createFolder() {
    const name = folderDraft.trim()
    if (!name || (tab !== 'links' && tab !== 'repo')) return
    const folder: PinComposerHubReferenceFolder = {
      id: `rfold_${crypto.randomUUID().slice(0, 8)}`,
      name,
      category: tab,
    }
    patch({ referenceFolders: [...referenceFolders, folder] })
    setFolderDraft('')
    setFolderId(folder.id)
  }

  const typeOptions =
    tab === 'files'
      ? REFERENCE_FILE_TYPES
      : tab === 'media'
        ? REFERENCE_MEDIA_TYPES
        : null

  return (
    <div
      ref={panelRef}
      className={styles.refAddPanel}
      style={{ left, top }}
      role="dialog"
      aria-label={strings.referencesAddPanel}
    >
      <div className={styles.refAddPanelHeader}>
        <span>{strings.referencesAddPanel}</span>
        <button
          type="button"
          className={styles.iconBtn}
          aria-label={strings.referencesClosePanel}
          onClick={onClose}
        >
          <X size={13} strokeWidth={2} aria-hidden />
        </button>
      </div>

      <div className={styles.refUrlRow}>
        <input
          className={styles.refUrlInput}
          value={draft}
          placeholder={strings.referencesAddUrlPlaceholder}
          aria-label={strings.referencesAddUrl}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              addFromDraft()
            }
          }}
        />
        <button
          type="button"
          className={styles.refAddBtn}
          disabled={!draft.trim()}
          onClick={addFromDraft}
        >
          {strings.referencesAdd}
        </button>
      </div>

      <button
        type="button"
        className={styles.refFinderBtn}
        disabled={!dataSource?.pickReferenceFiles || picking}
        onClick={() => void addFromFinder()}
      >
        <Plus size={12} strokeWidth={2} aria-hidden />
        {picking ? strings.referencesPicking : strings.referencesAddFiles}
      </button>

      <div className={styles.refTabRow} role="tablist">
        {(
          [
            ['files', strings.referencesTabFiles],
            ['media', strings.referencesTabMedia],
            ['links', strings.referencesTabLinks],
            ['repo', strings.referencesTabRepo],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={`${styles.refTab}${tab === id ? ` ${styles.refTabActive}` : ''}`}
            onClick={() => {
              setTab(id)
              setTypeMenuOpen(id === 'files' || id === 'media')
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'repo' ? (
        <p className={styles.refHint}>{strings.referencesTabRepoHint}</p>
      ) : null}

      {typeOptions && typeMenuOpen ? (
        <div className={styles.refTypeMenu} role="listbox">
          <button
            type="button"
            className={`${styles.refTypeChip}${typeFilter == null ? ` ${styles.refTypeChipActive}` : ''}`}
            onClick={() => setTypeFilter(null)}
          >
            {strings.referencesTypeAll}
          </button>
          {typeOptions.map((ext) => (
            <button
              key={ext}
              type="button"
              className={`${styles.refTypeChip}${typeFilter === ext ? ` ${styles.refTypeChipActive}` : ''}`}
              onClick={() =>
                setTypeFilter((prev) => (prev === ext ? null : ext))
              }
            >
              .{ext}
            </button>
          ))}
        </div>
      ) : null}

      {(tab === 'links' || tab === 'repo') && (
        <div className={styles.refFolderBlock}>
          <div className={styles.refFolderRow}>
            <button
              type="button"
              className={`${styles.refFolderChip}${folderId == null ? ` ${styles.refFolderChipActive}` : ''}`}
              onClick={() => setFolderId(null)}
            >
              {strings.referencesFolderAll}
            </button>
            <button
              type="button"
              className={`${styles.refFolderChip}${folderId === '__unfiled__' ? ` ${styles.refFolderChipActive}` : ''}`}
              onClick={() => setFolderId('__unfiled__')}
            >
              {strings.referencesFolderUnfiled}
            </button>
            {foldersForTab.map((folder) => (
              <button
                key={folder.id}
                type="button"
                className={`${styles.refFolderChip}${folderId === folder.id ? ` ${styles.refFolderChipActive}` : ''}`}
                onClick={() => setFolderId(folder.id)}
              >
                {folder.name}
              </button>
            ))}
          </div>
          <div className={styles.refUrlRow}>
            <input
              className={styles.refUrlInput}
              value={folderDraft}
              placeholder={strings.referencesFolderPlaceholder}
              aria-label={strings.referencesFolderNew}
              onChange={(event) => setFolderDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  createFolder()
                }
              }}
            />
            <button
              type="button"
              className={styles.refAddBtn}
              disabled={!folderDraft.trim()}
              onClick={createFolder}
              title={strings.referencesFolderNew}
            >
              <FolderPlus size={12} strokeWidth={2} aria-hidden />
            </button>
          </div>
        </div>
      )}

      <div className={styles.refAddPanelList}>
        {visibleRefs.length === 0 ? (
          <span className={styles.pickerEmpty}>
            {tab === 'links' && hub.references.some(isLinksLibraryRef)
              ? strings.referencesFolderEmpty
              : tab === 'repo' && hub.references.some(isRepoLibraryRef)
                ? strings.referencesFolderEmpty
                : strings.referencesLibraryEmpty}
          </span>
        ) : (
          visibleRefs.map((ref) => (
            <button
              key={ref.id}
              type="button"
              className={styles.rowItem}
              title="Remove"
              onClick={() => onRemoveReference(ref.id)}
            >
              <span className={styles.refKindBadge}>
                {ref.kind === 'github'
                  ? strings.referencesGithub
                  : ref.kind === 'url'
                    ? strings.referencesUrl
                    : ref.kind === 'file'
                      ? strings.referencesFile
                      : ref.kind === 'image'
                        ? strings.referencesImage
                        : ref.kind === 'video'
                          ? strings.referencesVideo
                          : strings.referencesAudio}
              </span>
              <span className={styles.rowLabel}>{referenceLabel(ref)}</span>
            </button>
          ))
        )}
      </div>
    </div>
  )
}
