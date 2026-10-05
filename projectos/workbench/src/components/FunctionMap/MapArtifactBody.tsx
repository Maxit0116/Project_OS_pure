import { useCallback, useEffect, useRef, useState } from 'react'
import { ExternalLink, GripVertical, Minus, Pencil, Palette, Plus } from 'lucide-react'
import type {
  AcceptanceCriterion,
  AcceptanceMapArtifact,
  ChecklistItem,
  ImageMapArtifact,
  MapArtifact,
  NoteMapArtifact,
  PlanMapArtifact,
  TerminalMapArtifact,
  UrlItem,
  UrlsMapArtifact,
} from '@contracts/index'
import { useI18n } from '../../i18n'
import { useWorkbenchStore } from '../../state/workbenchStore'
import { useBrowserStore } from '../../state/browserStore'
import { useTerminalStore } from '../../state/terminalStore'
import MapTerminalHost from './MapTerminalHost'
import NoteRichTextEditor from './noteEditor/NoteRichTextEditor'
import styles from './mapArtifactNodes.module.css'
import { newCriterionId, useDebouncedArtifactUpdate } from './useDebouncedArtifactUpdate'
import { useReconciledArtifactItems } from './useReconciledArtifactItems'
import { useRovingMenuFocus } from './useRovingMenuFocus'

interface Props {
  artifact: MapArtifact
  onTerminalFocus?: () => void
}

function NoteBody({ artifact }: { artifact: NoteMapArtifact }) {
  return (
    <div className={`${styles.noteBody} nodrag nopan`}>
      <NoteRichTextEditor artifact={artifact} />
    </div>
  )
}

function PlanBody({ artifact }: { artifact: PlanMapArtifact }) {
  const { ts } = useI18n()
  const { schedule, flush } = useDebouncedArtifactUpdate(artifact.id)
  const [items, setItems] = useReconciledArtifactItems<ChecklistItem>(
    artifact.id,
    artifact.updatedAt,
    artifact.plan.items,
  )

  const persist = (nextItems: ChecklistItem[]) => {
    schedule({ plan: { ...artifact.plan, items: nextItems } })
  }

  const flushPlan = (nextItems: ChecklistItem[]) => {
    flush({ plan: { ...artifact.plan, items: nextItems } })
  }

  return (
    <>
      <div className={`${styles.criteriaList} nodrag nopan`}>
        {items.map((item) => (
          <div key={item.id} className={`${styles.criteriaRow} nodrag nopan`}>
            <input
              type="checkbox"
              className="nodrag nopan"
              checked={item.done}
              onChange={(e) => {
                const nextItems = items.map((row) =>
                  row.id === item.id ? { ...row, done: e.target.checked } : row,
                )
                setItems(nextItems)
                persist(nextItems)
                flushPlan(nextItems)
              }}
            />
            <input
              className={`${styles.input} ${styles.criteriaInput} nodrag nopan`}
              value={item.text}
              placeholder={ts('mapArtifacts.planStepPlaceholder')}
              onChange={(e) => {
                const nextItems = items.map((row) =>
                  row.id === item.id ? { ...row, text: e.target.value } : row,
                )
                setItems(nextItems)
                persist(nextItems)
              }}
              onBlur={() => flushPlan(items)}
            />
            <button
              type="button"
              className={`${styles.removeCriterionBtn} nodrag nopan`}
              aria-label={ts('mapArtifacts.removeCriterion')}
              onClick={() => {
                const nextItems = items.filter((row) => row.id !== item.id)
                setItems(nextItems)
                persist(nextItems)
                flushPlan(nextItems)
              }}
            >
              <Minus size={14} strokeWidth={1.75} />
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        className={`${styles.addBtn} nodrag nopan`}
        onClick={() => {
          const nextItems = [...items, { id: newCriterionId(), text: '', done: false }]
          setItems(nextItems)
          persist(nextItems)
          flushPlan(nextItems)
        }}
      >
        <Plus size={12} strokeWidth={2} aria-hidden />
        {ts('mapArtifacts.addPlanStep')}
      </button>
    </>
  )
}

function AcceptanceBody({ artifact }: { artifact: AcceptanceMapArtifact }) {
  const { ts } = useI18n()
  const { schedule, flush } = useDebouncedArtifactUpdate(artifact.id)
  const [items, setItems] = useReconciledArtifactItems<AcceptanceCriterion>(
    artifact.id,
    artifact.updatedAt,
    artifact.acceptance.items,
  )

  const persist = (nextItems: AcceptanceCriterion[]) => {
    schedule({ acceptance: { ...artifact.acceptance, items: nextItems } })
  }

  const flushAcceptance = (nextItems: AcceptanceCriterion[]) => {
    flush({ acceptance: { ...artifact.acceptance, items: nextItems } })
  }

  return (
    <>
      <div className={`${styles.criteriaList} nodrag nopan`}>
        {items.map((item) => (
          <div key={item.id} className={`${styles.criteriaRow} nodrag nopan`}>
            <input
              type="checkbox"
              className="nodrag nopan"
              checked={item.done}
              onChange={(e) => {
                const nextItems = items.map((row) =>
                  row.id === item.id ? { ...row, done: e.target.checked } : row,
                )
                setItems(nextItems)
                persist(nextItems)
                flushAcceptance(nextItems)
              }}
            />
            <input
              className={`${styles.input} ${styles.criteriaInput} nodrag nopan`}
              value={item.text}
              placeholder={ts('mapArtifacts.criterionPlaceholder')}
              onChange={(e) => {
                const nextItems = items.map((row) =>
                  row.id === item.id ? { ...row, text: e.target.value } : row,
                )
                setItems(nextItems)
                persist(nextItems)
              }}
              onBlur={() => flushAcceptance(items)}
            />
            <button
              type="button"
              className={`${styles.removeCriterionBtn} nodrag nopan`}
              aria-label={ts('mapArtifacts.removeCriterion')}
              onClick={() => {
                const nextItems = items.filter((row) => row.id !== item.id)
                setItems(nextItems)
                persist(nextItems)
                flushAcceptance(nextItems)
              }}
            >
              <Minus size={14} strokeWidth={1.75} />
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        className={`${styles.addBtn} nodrag nopan`}
        onClick={() => {
          const nextItems = [...items, { id: newCriterionId(), text: '', done: false }]
          setItems(nextItems)
          persist(nextItems)
          flushAcceptance(nextItems)
        }}
      >
        <Plus size={12} strokeWidth={2} aria-hidden />
        {ts('mapArtifacts.addCriterion')}
      </button>
    </>
  )
}

function TerminalBody({
  artifact,
  onFocus,
}: {
  artifact: TerminalMapArtifact
  onFocus?: () => void
}) {
  const focusedMapArtifactId = useTerminalStore((s) => s.focusedMapArtifactId)

  return (
    <div
      className="nodrag nopan"
      style={{ display: 'flex', flex: 1, minHeight: 0 }}
      onMouseDown={onFocus}
    >
      <MapTerminalHost
        artifactId={artifact.id}
        cwd={artifact.terminal.cwd}
        width={artifact.size.width}
        height={artifact.size.height}
        focused={focusedMapArtifactId === artifact.id}
      />
    </div>
  )
}

function ImageBody({ artifact }: { artifact: ImageMapArtifact }) {
  const { ts } = useI18n()
  const client = useWorkbenchStore((s) => s.client)
  const project = useWorkbenchStore((s) => s.project)
  const [src, setSrc] = useState<string | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    setSrc(null)
    setLoadFailed(false)
    if (!project) return

    void client
      .getMapAssetDataUrl(project.projectId, artifact.image.assetPath)
      .then((dataUrl) => {
        if (!cancelled) setSrc(dataUrl)
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true)
      })

    return () => {
      cancelled = true
    }
  }, [client, project, artifact.id, artifact.image.assetPath])

  const imageAlt = artifact.image.title?.trim() || artifact.image.fileName

  return (
    <div className={`${styles.imageFrame} nodrag nopan`}>
      {loadFailed ? (
        <span className={styles.imagePlaceholder}>{ts('mapArtifacts.imageLoadFailed')}</span>
      ) : src ? (
        <img className={styles.imagePreview} src={src} alt={imageAlt} draggable={false} />
      ) : (
        <span className={styles.imagePlaceholder}>{ts('mapArtifacts.imageLoading')}</span>
      )}
    </div>
  )
}

interface UrlItemContextMenuState {
  x: number
  y: number
  itemId: string
  restoreFocusTo?: HTMLElement
}

function UrlItemContextMenu({
  menu,
  onClose,
  onEditTitle,
  onChangeColor,
}: {
  menu: UrlItemContextMenuState
  onClose: () => void
  onEditTitle: () => void
  onChangeColor: () => void
}) {
  const { ts } = useI18n()
  const menuRef = useRef<HTMLDivElement>(null)
  const handleMenuKeyDown = useRovingMenuFocus(
    menuRef,
    true,
    onClose,
    menu.restoreFocusTo,
  )

  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('[data-url-context-menu]')) onClose()
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => {
      document.removeEventListener('mousedown', handleMouseDown)
    }
  }, [onClose])

  return (
    <div
      ref={menuRef}
      data-url-context-menu
      className={styles.urlContextMenu}
      style={{ left: menu.x, top: menu.y }}
      role="menu"
      onKeyDown={handleMenuKeyDown}
    >
      <button
        type="button"
        role="menuitem"
        className={styles.urlContextMenuItem}
        onClick={() => { onEditTitle(); onClose() }}
      >
        <Pencil size={13} strokeWidth={1.75} aria-hidden />
        {ts('mapArtifacts.urlEditTitle')}
      </button>
      <button
        type="button"
        role="menuitem"
        className={styles.urlContextMenuItem}
        onClick={() => { onChangeColor(); onClose() }}
      >
        <Palette size={13} strokeWidth={1.75} aria-hidden />
        {ts('mapArtifacts.urlChangeColor')}
      </button>
    </div>
  )
}

function UrlColorPicker({
  onSelect,
  onClose,
}: {
  onSelect: (color: string | undefined) => void
  onClose: () => void
}) {
  const { ts } = useI18n()

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose() }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const presets = [
    { id: 'accent', token: '--color-accent', label: ts('mapArtifacts.noteFontColorAccent') },
    { id: 'success', token: '--color-success', label: ts('mapArtifacts.noteFontColorSuccess') },
    { id: 'warning', token: '--color-warning', label: ts('mapArtifacts.noteFontColorWarning') },
    { id: 'error', token: '--color-error', label: ts('mapArtifacts.noteFontColorError') },
    { id: 'violet', token: '--color-violet', label: ts('mapArtifacts.noteFontColorViolet') },
    { id: 'muted', token: '--color-text-secondary', label: ts('mapArtifacts.noteFontColorMuted') },
  ]

  const resolveColor = (token: string) => {
    const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim()
    return value.length > 0 ? value : '#ffffff'
  }

  return (
    <div className={styles.urlColorOverlay} data-zone-interactive>
      <button type="button" className={styles.urlColorBackdrop} onClick={onClose} aria-label={ts('common.close')} />
      <div className={styles.urlColorPanel}>
        <div className={styles.urlColorTitle}>{ts('mapArtifacts.urlColorDialogTitle')}</div>
        <div className={styles.urlColorGrid} role="listbox">
          {presets.map((preset) => {
            const color = resolveColor(preset.token)
            return (
              <button
                key={preset.id}
                type="button"
                role="option"
                aria-selected={false}
                aria-label={preset.label}
                className={styles.urlColorSwatch}
                onClick={() => { onSelect(color); onClose() }}
              >
                <span className={styles.urlColorSwatchInner} style={{ backgroundColor: color }} />
              </button>
            )
          })}
          <button
            type="button"
            role="option"
            aria-selected={false}
            aria-label="Default"
            className={styles.urlColorSwatch}
            onClick={() => { onSelect(undefined); onClose() }}
            title="Default"
          >
            <span className={`${styles.urlColorSwatchInner} ${styles.urlColorSwatchDefault}`} />
          </button>
        </div>
      </div>
    </div>
  )
}

function UrlsBody({ artifact }: { artifact: UrlsMapArtifact }) {
  const { ts } = useI18n()
  const { schedule, flush } = useDebouncedArtifactUpdate(artifact.id)
  const [items, setItems] = useReconciledArtifactItems<UrlItem>(
    artifact.id,
    artifact.updatedAt,
    artifact.urls.items,
  )
  const [addingUrl, setAddingUrl] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const addInputRef = useRef<HTMLInputElement>(null)
  const [contextMenu, setContextMenu] = useState<UrlItemContextMenuState | null>(null)
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null)
  const [editTitleValue, setEditTitleValue] = useState('')
  const [colorPickerItemId, setColorPickerItemId] = useState<string | null>(null)
  const dragItemRef = useRef<string | null>(null)
  const dragOverItemRef = useRef<string | null>(null)
  const longPressTimerRef = useRef<number | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)

  const persist = useCallback((nextItems: UrlItem[]) => {
    schedule({ urls: { ...artifact.urls, items: nextItems } })
  }, [artifact.urls, schedule])

  const flushUrls = useCallback((nextItems: UrlItem[]) => {
    flush({ urls: { ...artifact.urls, items: nextItems } })
  }, [artifact.urls, flush])

  const newUrlItemId = () => `url_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`

  const handleAddUrl = () => {
    const raw = inputValue.trim()
    if (!raw) return
    const url = normalizeUrl(raw)
    const newItem: UrlItem = { id: newUrlItemId(), url, title: raw }
    const nextItems = [...items, newItem]
    setItems(nextItems)
    persist(nextItems)
    flushUrls(nextItems)
    setInputValue('')
    setAddingUrl(false)

    void fetchUrlTitle(url).then((fetchedTitle) => {
      if (fetchedTitle) {
        setItems((current) => {
          const updated = current.map((item) =>
            item.id === newItem.id ? { ...item, title: fetchedTitle } : item,
          )
          flush({ urls: { ...artifact.urls, items: updated } })
          return updated
        })
      }
    })
  }

  const handleRemoveUrl = (itemId: string) => {
    const nextItems = items.filter((item) => item.id !== itemId)
    setItems(nextItems)
    persist(nextItems)
    flushUrls(nextItems)
  }

  const handleUrlClick = (url: string) => {
    useBrowserStore.getState().openOrSwitchTab(url)
    useWorkbenchStore.getState().setCenterTab('browser')
  }

  const handleContextMenu = (e: React.MouseEvent, itemId: string) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      itemId,
      ...(e.currentTarget instanceof HTMLElement
        ? { restoreFocusTo: e.currentTarget }
        : {}),
    })
  }

  const handleEditTitleConfirm = (itemId: string) => {
    const trimmed = editTitleValue.trim()
    if (trimmed.length === 0) {
      setEditingTitleId(null)
      return
    }
    const nextItems = items.map((item) =>
      item.id === itemId ? { ...item, title: trimmed } : item,
    )
    setItems(nextItems)
    persist(nextItems)
    flushUrls(nextItems)
    setEditingTitleId(null)
  }

  const handleColorSelect = (itemId: string, color: string | undefined) => {
    const nextItems = items.map((item) =>
      item.id === itemId ? { ...item, color } : item,
    )
    setItems(nextItems)
    persist(nextItems)
    flushUrls(nextItems)
  }

  const handleDragStart = (itemId: string) => {
    dragItemRef.current = itemId
    setDraggingId(itemId)
  }

  const handleDragEnter = (itemId: string) => {
    dragOverItemRef.current = itemId
    if (!dragItemRef.current || dragItemRef.current === itemId) return

    setItems((current) => {
      const dragIdx = current.findIndex((item) => item.id === dragItemRef.current)
      const overIdx = current.findIndex((item) => item.id === itemId)
      if (dragIdx === -1 || overIdx === -1) return current
      const next = [...current]
      const [removed] = next.splice(dragIdx, 1)
      next.splice(overIdx, 0, removed)
      return next
    })
  }

  const handleDragEnd = () => {
    dragItemRef.current = null
    dragOverItemRef.current = null
    setDraggingId(null)
    persist(items)
    flushUrls(items)
  }

  const handlePointerDown = (e: React.PointerEvent, itemId: string) => {
    if (e.button !== 0) return
    const target = e.currentTarget as HTMLElement
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTimerRef.current = null
      target.setAttribute('draggable', 'true')
      handleDragStart(itemId)
    }, 400)
  }

  const handlePointerUp = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }

  const handlePointerLeave = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }

  useEffect(() => {
    if (addingUrl) addInputRef.current?.focus()
  }, [addingUrl])

  return (
    <>
      {items.length === 0 && !addingUrl && (
        <div className={styles.urlEmptyHint}>{ts('mapArtifacts.urlEmptyHint')}</div>
      )}
      <div className={`${styles.criteriaList} nodrag nopan`}>
        {items.map((item) => (
          <div
            key={item.id}
            className={`${styles.urlRow} ${draggingId === item.id ? styles.urlRowDragging : ''} nodrag nopan`}
            draggable={draggingId === item.id}
            onDragEnter={() => handleDragEnter(item.id)}
            onDragEnd={handleDragEnd}
            onDragOver={(e) => e.preventDefault()}
            onContextMenu={(e) => handleContextMenu(e, item.id)}
          >
            <span
              className={`${styles.urlDragHandle} nodrag nopan`}
              onPointerDown={(e) => handlePointerDown(e, item.id)}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerLeave}
            >
              <GripVertical size={12} strokeWidth={1.5} />
            </span>
            <div className={styles.urlContent}>
              {editingTitleId === item.id ? (
                <input
                  className={`${styles.input} ${styles.urlTitleInput} nodrag nopan`}
                  value={editTitleValue}
                  autoFocus
                  onChange={(e) => setEditTitleValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); handleEditTitleConfirm(item.id) }
                    if (e.key === 'Escape') setEditingTitleId(null)
                  }}
                  onBlur={() => handleEditTitleConfirm(item.id)}
                />
              ) : (
                <button
                  type="button"
                  className={`${styles.urlTitle} nodrag nopan`}
                  style={item.color ? { color: item.color } : undefined}
                  onClick={() => handleUrlClick(item.url)}
                  title={item.url}
                >
                  <ExternalLink size={11} strokeWidth={1.75} className={styles.urlLinkIcon} aria-hidden />
                  {item.title || item.url}
                </button>
              )}
              <span
                className={styles.urlSubtitle}
                style={item.color ? { color: item.color, opacity: 0.7 } : undefined}
              >
                {item.url}
              </span>
            </div>
            <button
              type="button"
              className={`${styles.removeCriterionBtn} nodrag nopan`}
              aria-label={ts('mapArtifacts.removeUrl')}
              onClick={() => handleRemoveUrl(item.id)}
            >
              <Minus size={14} strokeWidth={1.75} />
            </button>
          </div>
        ))}
      </div>
      {addingUrl ? (
        <div className={`${styles.urlAddRow} nodrag nopan`}>
          <input
            ref={addInputRef}
            className={`${styles.input} ${styles.urlAddInput} nodrag nopan`}
            value={inputValue}
            placeholder={ts('mapArtifacts.urlPlaceholder')}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); handleAddUrl() }
              if (e.key === 'Escape') { setAddingUrl(false); setInputValue('') }
            }}
            onBlur={() => {
              if (!inputValue.trim()) { setAddingUrl(false); setInputValue('') }
            }}
          />
        </div>
      ) : (
        <button
          type="button"
          className={`${styles.addBtn} nodrag nopan`}
          onClick={() => setAddingUrl(true)}
        >
          <Plus size={12} strokeWidth={2} aria-hidden />
          {ts('mapArtifacts.addUrl')}
        </button>
      )}
      {contextMenu && (
        <UrlItemContextMenu
          menu={contextMenu}
          onClose={() => setContextMenu(null)}
          onEditTitle={() => {
            const item = items.find((i) => i.id === contextMenu.itemId)
            setEditTitleValue(item?.title || item?.url || '')
            setEditingTitleId(contextMenu.itemId)
          }}
          onChangeColor={() => {
            setColorPickerItemId(contextMenu.itemId)
          }}
        />
      )}
      {colorPickerItemId && (
        <UrlColorPicker
          onSelect={(color) => handleColorSelect(colorPickerItemId, color)}
          onClose={() => setColorPickerItemId(null)}
        />
      )}
    </>
  )
}

function normalizeUrl(raw: string): string {
  const trimmed = raw.trim()
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

async function fetchUrlTitle(url: string): Promise<string | null> {
  // Title is derived locally from the URL host — no main-process fetch.
  // A main-process fetchPageTitle (unrestricted net.fetch to arbitrary/internal
  // hosts) was an SSRF risk, so it was removed; the host is a safe default title.
  try {
    return new URL(normalizeUrl(url)).hostname || null
  } catch {
    return null
  }
}

export default function MapArtifactBody({ artifact, onTerminalFocus }: Props) {
  switch (artifact.type) {
    case 'note':
      return <NoteBody artifact={artifact} />
    case 'plan':
      return <PlanBody artifact={artifact} />
    case 'acceptance_list':
      return <AcceptanceBody artifact={artifact} />
    case 'terminal':
      return <TerminalBody artifact={artifact} onFocus={onTerminalFocus} />
    case 'image':
      return <ImageBody artifact={artifact} />
    case 'urls':
      return <UrlsBody artifact={artifact} />
  }
}
