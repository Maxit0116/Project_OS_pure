import { useEffect, useState, type DragEvent } from 'react'
import {
  LOOP_GRAPH_PRESETS,
  LOOP_PALETTE_ITEMS,
  type LoopPaletteCategory,
} from '@contracts/index'
import { ChevronLeft, ChevronRight, LayoutTemplate } from 'lucide-react'
import { useI18n } from '../../i18n'
import { useLoopGraphStore } from '../../state/loopGraphStore'
import {
  encodePaletteDragPayload,
  LOOP_PALETTE_MIME,
  visualForPaletteItem,
} from './loopNodeVisuals'
import styles from './LoopGraphPalette.module.css'

const CATEGORIES: LoopPaletteCategory[] = ['agent', 'action', 'logic', 'human']
const EXPAND_STORAGE_KEY = 'projectos.loopGraph.paletteExpanded'

interface Props {
  onPlaced?: (nodeId: string) => void
  /** World-space placement for click-to-place. */
  resolveClickPosition?: () => { x: number; y: number }
}

export default function LoopGraphPalette({ onPlaced, resolveClickPosition }: Props) {
  const { ts } = useI18n()
  const document = useLoopGraphStore((s) => s.document)
  const beginAuthorNodeFromPalette = useLoopGraphStore((s) => s.beginAuthorNodeFromPalette)
  const applyLoopPreset = useLoopGraphStore((s) => s.applyLoopPreset)
  const [expanded, setExpanded] = useState(() => {
    try {
      return sessionStorage.getItem(EXPAND_STORAGE_KEY) === '1'
    } catch {
      return false
    }
  })
  const [presetsOpen, setPresetsOpen] = useState(false)

  useEffect(() => {
    try {
      sessionStorage.setItem(EXPAND_STORAGE_KEY, expanded ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, [expanded])

  const defaultClickPosition = () => {
    if (!document) return { x: 80, y: 80 }
    const nodes = document.draft.nodes
    if (nodes.length === 0) return { x: 80, y: 80 }
    return {
      x: Math.max(...nodes.map((node) => node.position.x)) + 200,
      y: nodes.reduce((sum, node) => sum + node.position.y, 0) / nodes.length,
    }
  }

  const placeItem = async (paletteItemId: string, position?: { x: number; y: number }) => {
    if (!document) return
    const at = position ?? resolveClickPosition?.() ?? defaultClickPosition()
    const id = await beginAuthorNodeFromPalette(paletteItemId, at)
    if (id) onPlaced?.(id)
  }

  const onDragStart = (event: DragEvent, paletteItemId: string) => {
    event.dataTransfer.setData(LOOP_PALETTE_MIME, encodePaletteDragPayload(paletteItemId))
    event.dataTransfer.setData('text/plain', paletteItemId)
    event.dataTransfer.effectAllowed = 'copy'
  }

  return (
    <aside
      className={`${styles.palette} ${expanded ? styles.paletteExpanded : styles.paletteCollapsed}`}
      aria-label={ts('chat.loopGraph.palette')}
    >
      <div className={styles.toolbar}>
        <button
          type="button"
          className={styles.toggle}
          aria-expanded={expanded}
          title={
            expanded
              ? ts('chat.loopGraph.paletteCollapse')
              : ts('chat.loopGraph.paletteExpand')
          }
          aria-label={
            expanded
              ? ts('chat.loopGraph.paletteCollapse')
              : ts('chat.loopGraph.paletteExpand')
          }
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? <ChevronRight size={16} aria-hidden /> : <ChevronLeft size={16} aria-hidden />}
        </button>
      </div>

      <div className={styles.section}>
        {expanded ? (
          <h3 className={styles.sectionTitle}>{ts('chat.loopGraph.presets')}</h3>
        ) : null}
        {expanded ? (
          LOOP_GRAPH_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={styles.presetButton}
              disabled={!document}
              title={preset.description}
              onClick={() => void applyLoopPreset(preset.id)}
            >
              <span className={styles.itemTitle}>{preset.title}</span>
              <span className={styles.itemDesc}>{preset.description}</span>
            </button>
          ))
        ) : (
          <div className={styles.presetCollapsedWrap}>
            <button
              type="button"
              className={`${styles.iconButton} ${styles.catDraft}`}
              disabled={!document}
              title={ts('chat.loopGraph.presets')}
              aria-label={ts('chat.loopGraph.presets')}
              aria-expanded={presetsOpen}
              onClick={() => setPresetsOpen((value) => !value)}
            >
              <LayoutTemplate size={16} aria-hidden />
            </button>
            {presetsOpen ? (
              <div className={styles.presetPopover} role="menu">
                {LOOP_GRAPH_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    role="menuitem"
                    className={styles.presetMenuItem}
                    disabled={!document}
                    onClick={() => {
                      setPresetsOpen(false)
                      void applyLoopPreset(preset.id)
                    }}
                  >
                    {preset.title}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        )}
      </div>

      {CATEGORIES.map((category) => {
        const items = LOOP_PALETTE_ITEMS.filter((item) => item.category === category)
        return (
          <div key={category} className={styles.section}>
            {expanded ? (
              <h3 className={styles.sectionTitle}>
                {ts(`chat.loopGraph.paletteCategory.${category}`)}
              </h3>
            ) : (
              <span className={styles.categoryRailLabel} aria-hidden>
                {category.slice(0, 1).toUpperCase()}
              </span>
            )}
            <div className={expanded ? styles.itemList : styles.iconRail}>
              {items.map((item) => {
                const visual = visualForPaletteItem(item)
                const Icon = visual.Icon
                const categoryClass =
                  visual.categoryClass === 'catAgent'
                    ? styles.catAgent
                    : visual.categoryClass === 'catAction'
                      ? styles.catAction
                      : visual.categoryClass === 'catLogic'
                        ? styles.catLogic
                        : visual.categoryClass === 'catHuman'
                          ? styles.catHuman
                          : styles.catDraft
                if (!expanded) {
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`${styles.iconButton} ${categoryClass}`}
                      disabled={!document}
                      title={item.title}
                      aria-label={`${item.title}. ${item.description}`}
                      draggable={Boolean(document)}
                      onDragStart={(event) => onDragStart(event, item.id)}
                      onClick={() => void placeItem(item.id)}
                    >
                      <Icon size={16} aria-hidden strokeWidth={1.75} />
                    </button>
                  )
                }
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`${styles.itemButton} ${categoryClass}`}
                    disabled={!document}
                    title={item.description}
                    draggable={Boolean(document)}
                    onDragStart={(event) => onDragStart(event, item.id)}
                    onClick={() => void placeItem(item.id)}
                  >
                    <span className={styles.itemHead}>
                      <span className={`${styles.itemIcon} ${categoryClass}`}>
                        <Icon size={14} aria-hidden strokeWidth={1.75} />
                      </span>
                      <span className={styles.itemTitle}>{item.title}</span>
                    </span>
                    <span className={styles.itemDesc}>{item.description}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </aside>
  )
}
