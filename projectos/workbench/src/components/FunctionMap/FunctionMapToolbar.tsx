import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Layers2, RefreshCw, StickyNote } from 'lucide-react'
import { useI18n } from '../../i18n'
import { useWorkbenchStore } from '../../state/workbenchStore'
import Button from '../ui/Button'
import { useFunctionMap } from './FunctionMapContext'
import { buildMapSearchHits, type MapSearchHit } from './mapSearch'
import { MAP_CREATE_ARTIFACT_ACTIONS } from './mapCreateActions'
import { EDGE_COLORS } from './edgePresentation'
import contextMenuStyles from './FunctionMapContextMenu.module.css'
import styles from './FunctionMap.module.css'

const VIEWPORT_MARGIN = 8

interface Props {
  variant?: 'panel' | 'inline'
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
    edges,
    architectureLevels,
    showArtifacts,
    setShowArtifacts,
  } = useFunctionMap()
  const beginMapArtifactCreate = useWorkbenchStore((s) => s.beginMapArtifactCreate)
  const beginMapWorkGroupCreate = useWorkbenchStore((s) => s.beginMapWorkGroupCreate)
  const rescanStructureGraph = useWorkbenchStore((s) => s.rescanStructureGraph)
  const structureRescanLoading = useWorkbenchStore((s) => s.structureRescanLoading)
  const selectedNodeId = useWorkbenchStore((s) => s.selectedNodeId)
  const graph = useWorkbenchStore((s) => s.graph)
  const { ts } = useI18n()
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const [scanMenuOpen, setScanMenuOpen] = useState(false)
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null)
  const [scanMenuPosition, setScanMenuPosition] = useState<{ x: number; y: number } | null>(null)
  const addButtonRef = useRef<HTMLDivElement>(null)
  const addMenuRef = useRef<HTMLDivElement>(null)
  const scanButtonRef = useRef<HTMLDivElement>(null)
  const scanMenuRef = useRef<HTMLDivElement>(null)
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
  const relationKeys = Array.from(new Set(edges.map((edge) => edge.relation)))
  useLayoutEffect(() => {
    if (!addMenuOpen || !menuPosition) return

    const button = addButtonRef.current
    const menuEl = addMenuRef.current
    if (!button || !menuEl) return

    const buttonRect = button.getBoundingClientRect()
    const menuRect = menuEl.getBoundingClientRect()
    let x = menuPosition.x
    let y = menuPosition.y

    if (x + menuRect.width > window.innerWidth - VIEWPORT_MARGIN) {
      x = Math.max(VIEWPORT_MARGIN, window.innerWidth - menuRect.width - VIEWPORT_MARGIN)
    }
    if (y + menuRect.height > window.innerHeight - VIEWPORT_MARGIN) {
      y = Math.max(VIEWPORT_MARGIN, buttonRect.top - menuRect.height - 4)
    }

    if (x !== menuPosition.x || y !== menuPosition.y) {
      setMenuPosition({ x, y })
    }
  }, [addMenuOpen, menuPosition])

  useEffect(() => {
    if (!addMenuOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setAddMenuOpen(false)
        setMenuPosition(null)
      }
    }

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node
      if (addButtonRef.current?.contains(target) || addMenuRef.current?.contains(target)) {
        return
      }
      setAddMenuOpen(false)
      setMenuPosition(null)
    }

    const handleScroll = (event: Event) => {
      if (!shouldCloseToolbarMenuForScroll(addMenuRef.current, event.target)) return
      setAddMenuOpen(false)
      setMenuPosition(null)
    }

    document.addEventListener('keydown', handleKeyDown)
    const dismissTimer = window.setTimeout(() => {
      document.addEventListener('click', handleClickOutside, true)
    }, 0)
    window.addEventListener('scroll', handleScroll, true)

    return () => {
      window.clearTimeout(dismissTimer)
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('click', handleClickOutside, true)
      window.removeEventListener('scroll', handleScroll, true)
    }
  }, [addMenuOpen])

  useEffect(() => {
    if (!scanMenuOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setScanMenuOpen(false)
        setScanMenuPosition(null)
      }
    }
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node
      if (scanButtonRef.current?.contains(target) || scanMenuRef.current?.contains(target)) {
        return
      }
      setScanMenuOpen(false)
      setScanMenuPosition(null)
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
  }, [scanMenuOpen])

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

  const openAddMenu = () => {
    const rect = addButtonRef.current?.getBoundingClientRect()
    if (!rect) return
    setMenuPosition({ x: rect.left, y: rect.bottom + 4 })
    setAddMenuOpen(true)
  }

  const closeAddMenu = () => {
    setAddMenuOpen(false)
    setMenuPosition(null)
  }

  return (
    <div
      className={variant === 'inline' ? styles.toolbarInline : styles.toolbar}
      data-zone-interactive
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
        <div ref={scanButtonRef} className={styles.addMenuAnchor}>
          <Button
            variant="ghost"
            size="sm"
            disabled={structureRescanLoading}
            onClick={() => {
              const rect = scanButtonRef.current?.getBoundingClientRect()
              if (!rect) return
              if (scanMenuOpen) {
                setScanMenuOpen(false)
                setScanMenuPosition(null)
                return
              }
              setScanMenuPosition({ x: rect.left, y: rect.bottom + 4 })
              setScanMenuOpen(true)
            }}
            aria-expanded={scanMenuOpen}
            aria-haspopup="menu"
            title={ts('map.rescanStructure')}
          >
            <RefreshCw size={13} strokeWidth={1.75} aria-hidden />
            {structureRescanLoading ? ts('map.regeneratingStructure') : ts('map.rescanStructure')}
          </Button>
        </div>
        {scanMenuOpen &&
          scanMenuPosition &&
          createPortal(
            <div
              ref={scanMenuRef}
              className={contextMenuStyles.menu}
              role="menu"
              aria-label={ts('map.rescanStructure')}
              data-zone-interactive
              style={{ left: scanMenuPosition.x, top: scanMenuPosition.y }}
            >
              <button
                type="button"
                role="menuitem"
                className={contextMenuStyles.menuItem}
                onClick={() => {
                  setScanMenuOpen(false)
                  setScanMenuPosition(null)
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
                  setScanMenuOpen(false)
                  setScanMenuPosition(null)
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
                  setScanMenuOpen(false)
                  setScanMenuPosition(null)
                  void rescanStructureGraph({ mode: 'deepen', nodeIds: [selectedNodeId] })
                }}
              >
                {ts('map.deepenSelection')}
              </button>
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
        <div ref={addButtonRef} className={styles.addMenuAnchor}>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              if (addMenuOpen) {
                closeAddMenu()
              } else {
                openAddMenu()
              }
            }}
            aria-expanded={addMenuOpen}
            aria-haspopup="menu"
          >
            {ts('map.add')} ▾
          </Button>
        </div>
        {addMenuOpen &&
          menuPosition &&
          createPortal(
            <div
              ref={addMenuRef}
              className={contextMenuStyles.menu}
              role="menu"
              aria-label={ts('map.contextMenu.create')}
              data-zone-interactive
              style={{ left: menuPosition.x, top: menuPosition.y }}
            >
              <div className={contextMenuStyles.groupLabel} aria-hidden>
                {ts('map.contextMenu.create')}
              </div>
              {MAP_CREATE_ARTIFACT_ACTIONS.map(({ type, icon: Icon, labelKey }) => {
                const label = ts(labelKey)
                return (
                  <button
                    key={type}
                    type="button"
                    role="menuitem"
                    className={contextMenuStyles.menuItem}
                    onClick={() => {
                      beginMapArtifactCreate(type, { mode: 'viewportCenter' })
                      closeAddMenu()
                    }}
                  >
                    <Icon className={contextMenuStyles.menuItemIcon} size={14} strokeWidth={1.75} aria-hidden />
                    {label}
                  </button>
                )
              })}
              <div className={contextMenuStyles.groupLabel} aria-hidden>
                {ts('map.workGroup.createWorkGroup')}
              </div>
              <button
                type="button"
                role="menuitem"
                className={contextMenuStyles.menuItem}
                onClick={() => {
                  beginMapWorkGroupCreate({ source: 'toolbar' })
                  closeAddMenu()
                }}
              >
                <Layers2 className={contextMenuStyles.menuItemIcon} size={14} strokeWidth={1.75} aria-hidden />
                {ts('map.workGroup.createWorkGroup')}
              </button>
            </div>,
            document.body,
          )}
      </div>
      ) : null}
      {architectureLevels.length > 0 ? (
      <div className={styles.legend}>
        <span className={styles.legendTitle}>{ts('map.legend')}</span>
        {relationKeys.map((key) => (
          <span key={key} className={styles.legendItem}>
            <span className={styles.legendDot} style={{ background: EDGE_COLORS[key] }} />
            {ts(`map.relations.${key}`)}
          </span>
        ))}
      </div>
      ) : null}
    </div>
  )
}
