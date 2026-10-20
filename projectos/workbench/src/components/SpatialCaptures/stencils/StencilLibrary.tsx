import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import {
  UI_STENCIL_CATALOG,
  type StencilCategory,
  type StencilDefinition,
} from '@contracts/ui-stencil'
import type { RepoDesignSystemSnapshot } from '@contracts/repo-design-system'
import { stencilMapsToRepoBadge } from '@contracts/repo-design-system'
import StencilPreviewVisual from './StencilPreviewVisual'
import {
  STENCIL_UI_STRINGS_EN,
  type StencilUiStrings,
} from './stencilStrings'
import styles from './StencilLibrary.module.css'

const CATEGORIES: StencilCategory[] = ['base', 'motion', 'visual', 'preset']
/** Right-edge hot zone width — Stage Manager–like affordance. */
const EDGE_ZONE_PX = 18
/** Delay before auto-collapse after pointer leaves drawer/edge. */
const COLLAPSE_DELAY_MS = 280
/** Delay before first preview show (avoids flicker while scrolling). */
const PREVIEW_DELAY_MS = 90
/** Used to keep the hover card inside the overlay when aligning to a row. */
const PREVIEW_EST_HEIGHT = 292

interface Props {
  /** Pinned open via toolbar toggle (stays open until dismissed). */
  open: boolean
  /** Workspace design-system probe for "Maps to …" badges. */
  repoDesignSystem?: RepoDesignSystemSnapshot | null
  /** Highlight the stencil currently being dragged onto the capture. */
  draggingStencilId?: string | null
  onClose: () => void
  /**
   * Begin place-drag from a library row (pointer down).
   * Parent owns move/up, drop placement, and library collapse.
   */
  onPlaceDragStart: (
    stencilId: string,
    clientX: number,
    clientY: number,
  ) => void
  /** Fired when the drawer becomes visually revealed or hidden (pin or edge hover). */
  onRevealChange?: (revealed: boolean) => void
  /** Increment to force-collapse hover reveal (e.g. Esc). */
  collapseToken?: number
  strings?: StencilUiStrings
}

export default function StencilLibrary({
  open: pinned,
  repoDesignSystem = null,
  draggingStencilId = null,
  onClose,
  onPlaceDragStart,
  onRevealChange,
  collapseToken = 0,
  strings = STENCIL_UI_STRINGS_EN,
}: Props) {
  const [category, setCategory] = useState<StencilCategory>('base')
  const [query, setQuery] = useState('')
  const [hoverOpen, setHoverOpen] = useState(false)
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [previewTop, setPreviewTop] = useState(52)
  const collapseTimerRef = useRef<number | null>(null)
  const previewTimerRef = useRef<number | null>(null)
  const previewClearTimerRef = useRef<number | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const previewRef = useRef<HTMLDivElement | null>(null)
  const lastCollapseTokenRef = useRef(collapseToken)
  const previewIdRef = useRef<string | null>(null)

  // Dragging must not keep the drawer "open" — coexistence with region tools.
  const revealed = pinned || hoverOpen

  useEffect(() => {
    previewIdRef.current = previewId
  }, [previewId])

  useEffect(() => {
    onRevealChange?.(revealed)
  }, [revealed, onRevealChange])

  function clearCollapseTimer() {
    if (collapseTimerRef.current != null) {
      window.clearTimeout(collapseTimerRef.current)
      collapseTimerRef.current = null
    }
  }

  function clearPreviewTimers() {
    if (previewTimerRef.current != null) {
      window.clearTimeout(previewTimerRef.current)
      previewTimerRef.current = null
    }
    if (previewClearTimerRef.current != null) {
      window.clearTimeout(previewClearTimerRef.current)
      previewClearTimerRef.current = null
    }
  }

  useEffect(() => {
    if (collapseToken === lastCollapseTokenRef.current) return
    lastCollapseTokenRef.current = collapseToken
    clearCollapseTimer()
    clearPreviewTimers()
    setHoverOpen(false)
    setPreviewId(null)
  }, [collapseToken])

  useEffect(() => {
    return () => {
      clearCollapseTimer()
      clearPreviewTimers()
    }
  }, [])

  const items = useMemo(() => {
    const q = query.trim().toLowerCase()
    return UI_STENCIL_CATALOG.filter((item) => {
      if (item.category !== category) return false
      if (!q) return true
      return (
        item.id.includes(q) ||
        item.title.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.tags.some((tag) => tag.includes(q))
      )
    })
  }, [category, query])

  const previewItem = useMemo(
    () =>
      previewId
        ? (UI_STENCIL_CATALOG.find((item) => item.id === previewId) ?? null)
        : null,
    [previewId],
  )

  const categoryLabel = (id: StencilCategory): string => {
    if (id === 'base') return strings.categoryBase
    if (id === 'motion') return strings.categoryMotion
    if (id === 'preset') return strings.categoryPreset
    return strings.categoryVisual
  }

  function alignPreviewToRow(rowEl: HTMLElement) {
    const root = rootRef.current
    if (!root) return
    const rootRect = root.getBoundingClientRect()
    const rowRect = rowEl.getBoundingClientRect()
    const measured =
      previewRef.current?.getBoundingClientRect().height ?? PREVIEW_EST_HEIGHT
    const maxTop = Math.max(8, rootRect.height - measured - 8)
    const top = Math.max(8, Math.min(rowRect.top - rootRect.top, maxTop))
    setPreviewTop(top)
  }

  function openFromEdge() {
    clearCollapseTimer()
    setHoverOpen(true)
  }

  function scheduleCollapse() {
    clearCollapseTimer()
    collapseTimerRef.current = window.setTimeout(() => {
      setHoverOpen(false)
      setPreviewId(null)
      collapseTimerRef.current = null
    }, COLLAPSE_DELAY_MS)
  }

  function showPreviewForRow(id: string, rowEl: HTMLElement) {
    clearPreviewTimers()
    alignPreviewToRow(rowEl)
    if (previewIdRef.current) {
      setPreviewId(id)
      return
    }
    previewTimerRef.current = window.setTimeout(() => {
      setPreviewId(id)
      previewTimerRef.current = null
      requestAnimationFrame(() => alignPreviewToRow(rowEl))
    }, PREVIEW_DELAY_MS)
  }

  function schedulePreviewClear() {
    if (previewClearTimerRef.current != null) {
      window.clearTimeout(previewClearTimerRef.current)
    }
    previewClearTimerRef.current = window.setTimeout(() => {
      setPreviewId(null)
      previewClearTimerRef.current = null
    }, 80)
  }

  function handlePreviewEnter() {
    clearPreviewTimers()
    openFromEdge()
  }

  function handlePreviewLeave() {
    scheduleCollapse()
    schedulePreviewClear()
  }

  function handleDismiss() {
    clearCollapseTimer()
    clearPreviewTimers()
    setHoverOpen(false)
    setPreviewId(null)
    onClose()
  }

  const mapsBadge = previewItem
    ? stencilMapsToRepoBadge(previewItem.id, repoDesignSystem)
    : undefined

  return (
    <div
      ref={rootRef}
      className={`${styles.root}${revealed ? ` ${styles.rootOpen}` : ''}`}
      style={{ ['--stencil-edge' as string]: `${EDGE_ZONE_PX}px` }}
    >
      <div
        className={styles.edgeZone}
        aria-hidden={!revealed}
        title={strings.edgeHint}
        onPointerEnter={openFromEdge}
        onPointerLeave={scheduleCollapse}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <span className={styles.edgeGrip} />
      </div>

      <aside
        className={styles.drawer}
        aria-label={strings.library}
        aria-hidden={!revealed}
        onPointerEnter={openFromEdge}
        onPointerLeave={scheduleCollapse}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <header className={styles.header}>
          <div className={styles.titleBlock}>
            <h2 className={styles.title}>{strings.library}</h2>
            <p className={styles.subtitle}>{strings.libraryHint}</p>
          </div>
          <button
            type="button"
            className={styles.iconBtn}
            aria-label={strings.close}
            onClick={handleDismiss}
          >
            <X size={14} strokeWidth={2} aria-hidden />
          </button>
        </header>

        <div className={styles.searchRow}>
          <Search
            size={14}
            strokeWidth={2}
            className={styles.searchIcon}
            aria-hidden
          />
          <input
            className={styles.search}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={strings.search}
            aria-label={strings.search}
            tabIndex={revealed ? 0 : -1}
          />
        </div>

        <div className={styles.tabs} role="tablist">
          {CATEGORIES.map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={category === id}
              className={`${styles.tab}${category === id ? ` ${styles.tabActive}` : ''}`}
              onClick={() => setCategory(id)}
              tabIndex={revealed ? 0 : -1}
            >
              {categoryLabel(id)}
            </button>
          ))}
        </div>

        <ul className={styles.list}>
          {items.map((item) => (
            <li key={item.id}>
              <StencilRow
                item={item}
                dragging={draggingStencilId === item.id}
                codegenHint={item.codegen.packageHints?.[0]}
                mapsBadge={stencilMapsToRepoBadge(item.id, repoDesignSystem)}
                licenseLabel={strings.licenseNote}
                onPreviewEnter={(rowEl) => showPreviewForRow(item.id, rowEl)}
                onPreviewLeave={schedulePreviewClear}
                onPlaceDragStart={(clientX, clientY) =>
                  onPlaceDragStart(item.id, clientX, clientY)
                }
              />
            </li>
          ))}
          {items.length === 0 ? (
            <li className={styles.empty}>{strings.empty}</li>
          ) : null}
        </ul>
      </aside>

      {revealed && previewItem && !draggingStencilId ? (
        <div
          ref={previewRef}
          className={styles.preview}
          role="dialog"
          aria-label={previewItem.title}
          style={{ top: previewTop }}
          onPointerEnter={handlePreviewEnter}
          onPointerLeave={handlePreviewLeave}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <StencilPreviewVisual
            stencilId={previewItem.id}
            category={previewItem.category}
            title={previewItem.title}
          />
          <div className={styles.previewBody}>
            <div className={styles.previewTitleRow}>
              <span className={styles.previewTitle}>{previewItem.title}</span>
              <span
                className={styles.previewCategory}
                data-category={previewItem.category}
              >
                {categoryLabel(previewItem.category)}
              </span>
            </div>
            <p className={styles.previewDesc}>{previewItem.description}</p>
            {previewItem.licenseNote ? (
              <p className={styles.previewLicense}>
                {strings.licenseNote}: {previewItem.licenseNote}
              </p>
            ) : null}
            {mapsBadge ? (
              <p className={styles.previewMaps}>{mapsBadge}</p>
            ) : previewItem.codegen.packageHints?.[0] ? (
              <p className={styles.previewHint}>
                {previewItem.codegen.packageHints[0]}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function StencilRow({
  item,
  dragging,
  codegenHint,
  mapsBadge,
  licenseLabel,
  onPreviewEnter,
  onPreviewLeave,
  onPlaceDragStart,
}: {
  item: StencilDefinition
  dragging: boolean
  codegenHint?: string
  mapsBadge?: string
  licenseLabel: string
  onPreviewEnter: (rowEl: HTMLElement) => void
  onPreviewLeave: () => void
  onPlaceDragStart: (clientX: number, clientY: number) => void
}) {
  const rowRef = useRef<HTMLButtonElement | null>(null)

  return (
    <button
      ref={rowRef}
      type="button"
      className={`${styles.row}${dragging ? ` ${styles.rowArmed}` : ''}`}
      onPointerDown={(event) => {
        if (event.button !== 0) return
        event.preventDefault()
        event.stopPropagation()
        onPlaceDragStart(event.clientX, event.clientY)
      }}
      onPointerEnter={() => {
        if (rowRef.current) onPreviewEnter(rowRef.current)
      }}
      onPointerLeave={onPreviewLeave}
      onFocus={() => {
        if (rowRef.current) onPreviewEnter(rowRef.current)
      }}
      onBlur={onPreviewLeave}
      title={mapsBadge ?? codegenHint ?? item.title}
    >
      <span className={styles.thumb} data-category={item.category} aria-hidden>
        {item.title.slice(0, 1)}
      </span>
      <span className={styles.rowBody}>
        <span className={styles.rowTitle}>{item.title}</span>
        <span className={styles.rowDesc}>{item.description}</span>
        {mapsBadge ? (
          <span className={styles.rowMaps}>{mapsBadge}</span>
        ) : codegenHint ? (
          <span className={styles.rowHint}>{codegenHint}</span>
        ) : null}
        {item.licenseNote ? (
          <span className={styles.rowLicense}>
            {licenseLabel}: {item.licenseNote}
          </span>
        ) : null}
      </span>
    </button>
  )
}
