import { mapTextLanguage } from './mapTextLanguage'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, RotateCcw, SlidersHorizontal, StickyNote } from 'lucide-react'
import { useI18n } from '../../i18n'
import { useWorkbenchStore } from '../../state/workbenchStore'
import Button from '../ui/Button'
import { useFunctionMap } from './FunctionMapContext'
import { buildMapSearchHits, type MapSearchHit } from './mapSearch'
import contextMenuStyles from './FunctionMapContextMenu.module.css'
import styles from './FunctionMap.module.css'

const VIEWPORT_MARGIN = 8

interface Props {
  variant?: 'panel' | 'inline' | 'corner'
}

function SearchHitTitle({ title, query }: { title: string; query: string }) {
  const needle = query.trim()
  const index = needle ? title.toLowerCase().indexOf(needle.toLowerCase()) : -1
  if (index < 0) return title
  return (
    <>
      {title.slice(0, index)}
      <mark className={styles.searchHitMark}>{title.slice(index, index + needle.length)}</mark>
      {title.slice(index + needle.length)}
    </>
  )
}

export function shouldCloseToolbarMenuForScroll(
  menu: Pick<HTMLElement, 'contains'> | null,
  eventTarget: EventTarget | null,
): boolean {
  if (!menu || !eventTarget) return true
  try {
    return !menu.contains(eventTarget as Node)
  } catch {
    return true
  }
}

export default function FunctionMapToolbar({ variant = 'panel' }: Props) {
  const {
    search,
    setSearch,
    graphNodes,
    mapContent,
    jumpToMapSearchHit,
    architectureLevels,
    showArtifacts,
    setShowArtifacts,
    resetC4Layout,
    confidencePerspective,
    setConfidencePerspective,
    hideHeuristicNodes,
    setHideHeuristicNodes,
    architecture,
  } = useFunctionMap()
  const rescanStructureGraph = useWorkbenchStore((s) => s.rescanStructureGraph)
  const mapDetail = useWorkbenchStore((s) => s.mapDetail)
  const interfaceLocale = useWorkbenchStore((s) => s.locale)
  const textLanguage = mapTextLanguage(graphNodes)
  const setMapDetail = useWorkbenchStore((s) => s.setMapDetail)
  const structureRescanLoading = useWorkbenchStore((s) => s.structureRescanLoading)
  const selectedNodeId = useWorkbenchStore((s) => s.selectedNodeId)
  const graph = useWorkbenchStore((s) => s.graph)
  const { ts } = useI18n()
  const [displayMenuOpen, setDisplayMenuOpen] = useState(false)
  const [displayMenuPosition, setDisplayMenuPosition] = useState<{
    x: number
    y: number
  } | null>(null)
  const displayButtonRef = useRef<HTMLDivElement>(null)
  const displayMenuRef = useRef<HTMLDivElement>(null)
  const isC4 = architecture?.notation === 'c4'
  const searchAnchorRef = useRef<HTMLDivElement>(null)
  const searchMenuRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchActiveIndex, setSearchActiveIndex] = useState(0)
  const [searchMenuBox, setSearchMenuBox] = useState<{
    x: number
    y: number
    width: number
  } | null>(null)
  const searchHits = useMemo(
    () =>
      buildMapSearchHits({
        nodes: graphNodes,
        artifacts: mapContent?.artifacts,
        workGroups: mapContent?.workGroups,
        query: search,
      }),
    [graphNodes, mapContent?.artifacts, mapContent?.workGroups, search],
  )
  const searchQuery = search.trim()
  const activeSearchIndex =
    searchHits.length === 0 ? 0 : Math.min(searchActiveIndex, searchHits.length - 1)
  const selectedNode = graph?.nodes.find((node) => node.id === selectedNodeId)
  const canDeepen =
    selectedNode?.level === 'container' || selectedNode?.level === 'component'
  useLayoutEffect(() => {
    if (!displayMenuOpen || !displayMenuPosition) return

    const button = displayButtonRef.current
    const menuEl = displayMenuRef.current
    if (!button || !menuEl) return

    const buttonRect = button.getBoundingClientRect()
    const menuRect = menuEl.getBoundingClientRect()
    let x = displayMenuPosition.x
    let y = displayMenuPosition.y

    if (x + menuRect.width > window.innerWidth - VIEWPORT_MARGIN) {
      x = Math.max(VIEWPORT_MARGIN, window.innerWidth - menuRect.width - VIEWPORT_MARGIN)
    }
    if (y + menuRect.height > window.innerHeight - VIEWPORT_MARGIN) {
      y = Math.max(VIEWPORT_MARGIN, buttonRect.top - menuRect.height - 4)
    }

    if (x !== displayMenuPosition.x || y !== displayMenuPosition.y) {
      setDisplayMenuPosition({ x, y })
    }
  }, [displayMenuOpen, displayMenuPosition])

  useEffect(() => {
    if (!displayMenuOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setDisplayMenuOpen(false)
        setDisplayMenuPosition(null)
      }
    }
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node
      if (
        displayButtonRef.current?.contains(target) ||
        displayMenuRef.current?.contains(target)
      ) {
        return
      }
      setDisplayMenuOpen(false)
      setDisplayMenuPosition(null)
    }
    document.addEventListener('keydown', handleKeyDown)
    const dismissTimer = window.setTimeout(() => {
      document.addEventListener('click', handleClickOutside, true)
    }, 0)
    return () => {
      window.clearTimeout(dismissTimer)
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('click', handleClickOutside, true)
    }
  }, [displayMenuOpen])

  const closeDisplayMenu = () => {
    setDisplayMenuOpen(false)
    setDisplayMenuPosition(null)
  }

  useLayoutEffect(() => {
    if (!searchOpen) return
    const anchor = searchAnchorRef.current
    if (!anchor) return
    const rect = anchor.getBoundingClientRect()
    const width = Math.max(rect.width, 280)
    let x = rect.left
    if (x + width > window.innerWidth - VIEWPORT_MARGIN) {
      x = Math.max(VIEWPORT_MARGIN, window.innerWidth - width - VIEWPORT_MARGIN)
    }
    setSearchMenuBox({ x, y: rect.bottom + 4, width })
  }, [searchOpen, searchHits.length, search])

  useEffect(() => {
    if (!searchOpen) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSearchOpen(false)
    }
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (
        searchAnchorRef.current?.contains(target) ||
        searchMenuRef.current?.contains(target)
      ) {
        return
      }
      setSearchOpen(false)
    }
    const placeMenu = () => {
      const anchor = searchAnchorRef.current
      if (!anchor) return
      const rect = anchor.getBoundingClientRect()
      const width = Math.max(rect.width, 280)
      let x = rect.left
      if (x + width > window.innerWidth - VIEWPORT_MARGIN) {
        x = Math.max(VIEWPORT_MARGIN, window.innerWidth - width - VIEWPORT_MARGIN)
      }
      setSearchMenuBox({ x, y: rect.bottom + 4, width })
    }
    document.addEventListener('keydown', handleKeyDown)
    const dismissTimer = window.setTimeout(() => {
      document.addEventListener('mousedown', handlePointerDown, true)
    }, 0)
    window.addEventListener('resize', placeMenu)
    window.addEventListener('scroll', placeMenu, true)
    return () => {
      window.clearTimeout(dismissTimer)
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('mousedown', handlePointerDown, true)
      window.removeEventListener('resize', placeMenu)
      window.removeEventListener('scroll', placeMenu, true)
    }
  }, [searchOpen])

  const chooseSearchHit = (hit: MapSearchHit) => {
    jumpToMapSearchHit(hit)
    setSearch('')
    setSearchOpen(false)
    setSearchActiveIndex(0)
  }

  const toolbarClass =
    variant === 'inline'
      ? styles.toolbarInline
      : variant === 'corner'
        ? styles.toolbarCorner
        : styles.toolbar

  return (
    <div
      className={toolbarClass}
      data-zone-interactive
      data-map-toolbar={variant}
    >
      <div className={styles.searchAnchor} ref={searchAnchorRef}>
        <input
          ref={searchInputRef}
          type="search"
          role="combobox"
          className={styles.search}
          placeholder={ts('map.searchPlaceholder')}
          value={search}
          aria-label={ts('map.searchPlaceholder')}
          aria-expanded={searchOpen}
          aria-controls="map-search-results"
          aria-autocomplete="list"
          aria-activedescendant={
            searchOpen && searchHits[activeSearchIndex]
              ? `map-search-hit-${searchHits[activeSearchIndex].kind}-${searchHits[activeSearchIndex].id}`
              : undefined
          }
          onChange={(event) => {
            setSearch(event.target.value)
            setSearchActiveIndex(0)
            setSearchOpen(event.target.value.trim().length > 0)
          }}
          onFocus={() => {
            if (searchQuery) setSearchOpen(true)
          }}
          onKeyDown={(event) => {
            if (!searchOpen && (event.key === 'ArrowDown' || event.key === 'Enter') && searchQuery) {
              setSearchOpen(true)
              event.preventDefault()
              return
            }
            if (!searchOpen) return
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              setSearchActiveIndex((index) =>
                searchHits.length === 0 ? 0 : (index + 1) % searchHits.length,
              )
            } else if (event.key === 'ArrowUp') {
              event.preventDefault()
              setSearchActiveIndex((index) =>
                searchHits.length === 0 ? 0 : (index - 1 + searchHits.length) % searchHits.length,
              )
            } else if (event.key === 'Enter') {
              const hit = searchHits[activeSearchIndex]
              if (!hit) return
              event.preventDefault()
              chooseSearchHit(hit)
            } else if (event.key === 'Escape') {
              event.preventDefault()
              setSearchOpen(false)
            }
          }}
        />
        {searchOpen &&
          searchMenuBox &&
          createPortal(
            <div
              ref={searchMenuRef}
              id="map-search-results"
              className={styles.searchResults}
              role="listbox"
              aria-label={ts('map.searchResults')}
              data-zone-interactive
              style={{ left: searchMenuBox.x, top: searchMenuBox.y, width: searchMenuBox.width }}
            >
              {searchHits.length === 0 ? (
                <div className={styles.searchEmpty}>{ts('map.searchEmpty')}</div>
              ) : (
                searchHits.map((hit, index) => {
                  const kindLabel =
                    hit.kind === 'feature' && hit.level
                      ? ts(`map.levels.${hit.level}`)
                      : ts(`map.searchKinds.${hit.kind}`)
                  return (
                    <button
                      key={`${hit.kind}:${hit.id}`}
                      id={`map-search-hit-${hit.kind}-${hit.id}`}
                      type="button"
                      role="option"
                      aria-selected={index === activeSearchIndex}
                      className={`${styles.searchHit} ${index === activeSearchIndex ? styles.searchHitActive : ''}`}
                      onMouseEnter={() => setSearchActiveIndex(index)}
                      onMouseDown={(event) => {
                        event.preventDefault()
                        chooseSearchHit(hit)
                      }}
                    >
                      <span className={styles.searchHitTitle}>
                        <SearchHitTitle title={hit.title} query={searchQuery} />
                      </span>
                      <span className={styles.searchHitKind}>{kindLabel}</span>
                    </button>
                  )
                })
              )}
            </div>,
            document.body,
          )}
      </div>
      {architectureLevels.length > 0 ? (
      <div className={styles.createActions}>
        <div ref={displayButtonRef} className={styles.addMenuAnchor}>
          <Button
            variant={
              confidencePerspective || hideHeuristicNodes || structureRescanLoading
                ? 'secondary'
                : 'ghost'
            }
            size="sm"
            disabled={structureRescanLoading}
            onClick={() => {
              const rect = displayButtonRef.current?.getBoundingClientRect()
              if (!rect) return
              if (displayMenuOpen) {
                closeDisplayMenu()
                return
              }
              setDisplayMenuPosition({ x: rect.left, y: rect.bottom + 4 })
              setDisplayMenuOpen(true)
            }}
            aria-expanded={displayMenuOpen}
            aria-haspopup="menu"
            title={ts('map.displayMenuHint')}
          >
            <SlidersHorizontal size={13} strokeWidth={1.75} aria-hidden />
            {structureRescanLoading
              ? ts('map.regeneratingStructure')
              : ts('map.displayMenu')}
          </Button>
        </div>
        {displayMenuOpen &&
          displayMenuPosition &&
          createPortal(
            <div
              ref={displayMenuRef}
              className={contextMenuStyles.menu}
              role="menu"
              aria-label={ts('map.displayMenu')}
              data-zone-interactive
              style={{ left: displayMenuPosition.x, top: displayMenuPosition.y }}
            >
              <div className={contextMenuStyles.groupLabel} aria-hidden>
                {ts('map.detail.label')}
              </div>
              {(['simple', 'technical'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  role="menuitemradio"
                  aria-checked={mapDetail === value}
                  className={contextMenuStyles.menuItem}
                  title={ts('map.detail.help')}
                  onClick={() => {
                    setMapDetail(value)
                    closeDisplayMenu()
                  }}
                >
                  {mapDetail === value ? '✓ ' : ''}
                  {ts(`map.detail.${value}`)}
                </button>
              ))}
              {textLanguage && textLanguage !== interfaceLocale ? (
                <button
                  type="button"
                  role="menuitem"
                  className={contextMenuStyles.menuItem}
                  onClick={() => {
                    closeDisplayMenu()
                    void rescanStructureGraph({ mode: 'translate' })
                  }}
                >
                  {ts('map.translateStructure', { language: interfaceLocale === 'zh' ? '中文' : 'English' })}
                </button>
              ) : null}
              <div className={contextMenuStyles.separator} aria-hidden />
              <div className={contextMenuStyles.groupLabel} aria-hidden>
                {ts('map.displayMenuStructure')}
              </div>
              <button
                type="button"
                role="menuitem"
                className={contextMenuStyles.menuItem}
                onClick={() => {
                  closeDisplayMenu()
                  if (!window.confirm(ts('map.regenerateStructureConfirm'))) return
                  void rescanStructureGraph({ mode: 'regenerate' })
                }}
              >
                {ts('map.regenerateStructure')}
              </button>
              <button
                type="button"
                role="menuitem"
                className={contextMenuStyles.menuItem}
                onClick={() => {
                  closeDisplayMenu()
                  void rescanStructureGraph({ mode: 'refine' })
                }}
              >
                {ts('map.refineStructure')}
              </button>
              <button
                type="button"
                role="menuitem"
                className={contextMenuStyles.menuItem}
                disabled={!canDeepen}
                title={canDeepen ? undefined : ts('map.deepenSelectionDisabled')}
                onClick={() => {
                  if (!canDeepen || !selectedNodeId) return
                  closeDisplayMenu()
                  void rescanStructureGraph({ mode: 'deepen', nodeIds: [selectedNodeId] })
                }}
              >
                {ts('map.deepenSelection')}
              </button>
              {isC4 ? (
                <>
                  <div className={contextMenuStyles.separator} aria-hidden />
                  <div className={contextMenuStyles.groupLabel} aria-hidden>
                    {ts('map.displayMenuView')}
                  </div>
                  <button
                    type="button"
                    role="menuitem"
                    className={contextMenuStyles.menuItem}
                    title={ts('map.resetLayoutHint')}
                    onClick={() => {
                      closeDisplayMenu()
                      resetC4Layout()
                    }}
                  >
                    <RotateCcw
                      className={contextMenuStyles.menuItemIcon}
                      size={14}
                      strokeWidth={1.75}
                      aria-hidden
                    />
                    {ts('map.resetLayout')}
                  </button>
                  <button
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={confidencePerspective}
                    className={contextMenuStyles.menuItem}
                    title={ts('map.confidencePerspectiveHint')}
                    onClick={() => setConfidencePerspective(!confidencePerspective)}
                  >
                    <span className={contextMenuStyles.menuItemCheck} aria-hidden>
                      {confidencePerspective ? (
                        <Check size={14} strokeWidth={2} />
                      ) : null}
                    </span>
                    {ts('map.confidencePerspective')}
                  </button>
                  <button
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={hideHeuristicNodes}
                    className={contextMenuStyles.menuItem}
                    title={ts('map.hideHeuristicHint')}
                    onClick={() => setHideHeuristicNodes(!hideHeuristicNodes)}
                  >
                    <span className={contextMenuStyles.menuItemCheck} aria-hidden>
                      {hideHeuristicNodes ? (
                        <Check size={14} strokeWidth={2} />
                      ) : null}
                    </span>
                    {ts('map.hideHeuristic')}
                  </button>
                </>
              ) : null}
            </div>,
            document.body,
          )}
        <Button
          variant={showArtifacts ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => setShowArtifacts(!showArtifacts)}
          aria-pressed={showArtifacts}
          title={ts('map.artifactsHint')}
        >
          <StickyNote size={13} strokeWidth={1.75} aria-hidden />
          {ts('map.artifacts')}
        </Button>
      </div>
      ) : null}
    </div>
  )
}
