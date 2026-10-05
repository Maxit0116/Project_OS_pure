import { useCallback, useEffect, useState, useMemo, useRef } from 'react'
import { Search, CornerDownLeft } from 'lucide-react'
import { useWorkbenchStore } from '../../state/workbenchStore'
import { useBottomDockStore } from '../../state/bottomDockStore'
import { useTerminalStore } from '../../state/terminalStore'
import { isDesktopApp } from '../../data/clientMode'
import { useI18n } from '../../i18n'
import { GlassLens } from '../Glass'
import {
  handleTopmostOverlayEscape,
  registerOverlay,
} from '../overlays/overlayStack'
import { handleCommandPaletteNavigation } from './commandPaletteKeyboard'
import type { SemanticTreeNode } from '@contracts/index'
import styles from './CommandPalette.module.css'

function collectFiles(nodes: SemanticTreeNode[]): { path: string; label: string }[] {
  const files: { path: string; label: string }[] = []
  const walk = (n: SemanticTreeNode) => {
    if (n.path) files.push({ path: n.path, label: n.label })
    n.children.forEach(walk)
  }
  nodes.forEach(walk)
  return files
}

interface Command {
  id: string
  label: string
  group: string
  action: () => void
}

export default function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const overlayTokenRef = useRef(Symbol('command-palette'))
  const phase = useWorkbenchStore((s) => s.phase)
  const runGoogleLoginScenario = useWorkbenchStore((s) => s.runGoogleLoginScenario)
  const triggerAuthError = useWorkbenchStore((s) => s.triggerAuthError)
  const resetDemo = useWorkbenchStore((s) => s.resetDemo)
  const togglePanel = useBottomDockStore((s) => s.togglePanel)
  const openPanel = useBottomDockStore((s) => s.openPanel)
  const setActiveView = useBottomDockStore((s) => s.setActiveView)
  const createTab = useTerminalStore((s) => s.createTab)
  const killActiveTab = useTerminalStore((s) => s.killActiveTab)
  const splitTerminal = useTerminalStore((s) => s.splitTerminal)
  const graph = useWorkbenchStore((s) => s.graph)
  const tree = useWorkbenchStore((s) => s.tree)
  const selectNode = useWorkbenchStore((s) => s.selectNode)
  const selectFile = useWorkbenchStore((s) => s.selectFile)
  const setCenterTab = useWorkbenchStore((s) => s.setCenterTab)
  const setLocale = useWorkbenchStore((s) => s.setLocale)
  const locale = useWorkbenchStore((s) => s.locale)
  const { ts } = useI18n()

  const closePalette = useCallback(() => {
    setOpen(false)
    setQuery('')
    setHighlightedIndex(0)
  }, [])

  useEffect(() => {
    if (!open) return
    return registerOverlay(overlayTokenRef.current)
  }, [open])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen((current) => !current)
        setQuery('')
        setHighlightedIndex(0)
        return
      }
      if (open) {
        handleTopmostOverlayEscape(e, overlayTokenRef.current, closePalette)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [closePalette, open])

  const commands = useMemo(() => {
    const cmds: Command[] = [
      {
        id: 'go-map',
        label: ts('commandPalette.goFunctionMap'),
        group: 'Navigation',
        action: () => setCenterTab('function-map'),
      },
      {
        id: 'go-flow',
        label: ts('commandPalette.goAgentFlow'),
        group: 'Navigation',
        action: () => setCenterTab('agent-flow'),
      },
      {
        id: 'go-code',
        label: ts('commandPalette.goCode'),
        group: 'Navigation',
        action: () => setCenterTab('code'),
      },
      {
        id: 'lang',
        label: ts('commandPalette.switchLanguage'),
        group: 'Settings',
        action: () => setLocale(locale === 'zh' ? 'en' : 'zh'),
      },
    ]

    if (phase === 'ready') {
      cmds.push(
        {
          id: 'terminal-toggle',
          label: ts('terminal.togglePanel'),
          group: 'Terminal',
          action: () => togglePanel(),
        },
        {
          id: 'terminal-new',
          label: ts('terminal.newTab'),
          group: 'Terminal',
          action: () => {
            openPanel('terminal')
            void createTab()
          },
        },
        {
          id: 'terminal-kill',
          label: ts('terminal.killTab'),
          group: 'Terminal',
          action: () => void killActiveTab(),
        },
      )

      if (isDesktopApp()) {
        cmds.push(
          {
            id: 'terminal-split-right',
            label: ts('terminal.splitRight'),
            group: 'Terminal',
            action: () => void splitTerminal('horizontal'),
          },
          {
            id: 'terminal-split-down',
            label: ts('terminal.splitDown'),
            group: 'Terminal',
            action: () => void splitTerminal('vertical'),
          },
        )
      }

      cmds.push(
        {
          id: 'bottom-dock-activity',
          label: ts('bottomDock.views.activity'),
          group: ts('bottomDock.title'),
          action: () => setActiveView('activity'),
        },
        {
          id: 'bottom-dock-services',
          label: ts('bottomDock.views.services'),
          group: ts('bottomDock.title'),
          action: () => setActiveView('services'),
        },
        {
          id: 'bottom-dock-diagnostics',
          label: ts('bottomDock.views.diagnostics'),
          group: ts('bottomDock.title'),
          action: () => setActiveView('diagnostics'),
        },
      )

      cmds.push(
        {
          id: 'demo-google-login',
          label: ts('demo.googleLogin'),
          group: ts('commandPalette.groupDemo'),
          action: () => void runGoogleLoginScenario(),
        },
        {
          id: 'demo-trigger-error',
          label: ts('demo.triggerError'),
          group: ts('commandPalette.groupDemo'),
          action: () => void triggerAuthError(),
        },
        {
          id: 'demo-reset',
          label: ts('demo.reset'),
          group: ts('commandPalette.groupDemo'),
          action: () => void resetDemo(),
        },
      )
    }

    graph?.nodes.forEach((n) => {
      cmds.push({
        id: `node-${n.id}`,
        label: n.name,
        group: 'Features',
        action: () => void selectNode(n.id),
      })
    })

    if (tree) {
      collectFiles(tree.roots).forEach((f) => {
        cmds.push({
          id: `file-${f.path}`,
          label: f.path,
          group: 'Files',
          action: () => void selectFile(f.path),
        })
      })
    }

    return cmds
  }, [graph, tree, selectNode, selectFile, setCenterTab, setLocale, locale, ts, phase, runGoogleLoginScenario, triggerAuthError, resetDemo, togglePanel, openPanel, setActiveView, createTab, killActiveTab, splitTerminal])

  const filtered = commands.filter((c) =>
    c.label.toLowerCase().includes(query.toLowerCase()),
  )

  useEffect(() => {
    if (filtered.length === 0) {
      setHighlightedIndex(0)
    } else if (highlightedIndex >= filtered.length) {
      setHighlightedIndex(filtered.length - 1)
    }
  }, [filtered.length, highlightedIndex])

  const highlightedCommandId = filtered[highlightedIndex]?.id
  useEffect(() => {
    if (!open || !highlightedCommandId) return
    document
      .getElementById(`command-palette-${highlightedCommandId}`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [highlightedCommandId, open])

  const run = (cmd: Command) => {
    cmd.action()
    closePalette()
  }

  if (!open) return null

  return (
    <div className={styles.overlay} onClick={closePalette}>
      <GlassLens
        radius={28}
        tint="overlay"
        className={`${styles.palette} glass-overlay-enter glass-slide-down`}
        style={{ width: '100%', maxWidth: 480 }}
      >
        <div onClick={(e) => e.stopPropagation()}>
          <div className={styles.inputRow}>
            <Search className={styles.searchIcon} size={16} strokeWidth={1.75} aria-hidden />
            <input
              className={styles.input}
              autoFocus
              role="combobox"
              aria-expanded="true"
              aria-controls="command-palette-list"
              aria-activedescendant={filtered[highlightedIndex]
                ? `command-palette-${filtered[highlightedIndex].id}`
                : undefined}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setHighlightedIndex(0)
              }}
              onKeyDown={(event) => {
                handleCommandPaletteNavigation(
                  event,
                  highlightedIndex,
                  filtered.length,
                  setHighlightedIndex,
                  (index) => {
                    const command = filtered[index]
                    if (command) run(command)
                  },
                )
              }}
              placeholder={ts('commandPalette.placeholder')}
            />
          </div>
          <div
            id="command-palette-list"
            role="listbox"
            className={`${styles.list} ${styles.listOpen}`}
          >
            {filtered.length === 0 && (
              <div className={styles.empty}>{ts('commandPalette.noResults')}</div>
            )}
            {filtered.map((cmd, index) => (
              <button
                key={cmd.id}
                id={`command-palette-${cmd.id}`}
                type="button"
                role="option"
                aria-selected={index === highlightedIndex}
                className={`${styles.item} ${index === highlightedIndex ? styles.itemHighlighted : ''}`}
                onClick={() => run(cmd)}
                onMouseEnter={() => setHighlightedIndex(index)}
                style={{ animationDelay: `${index * 28}ms` }}
              >
                <span className={styles.itemLabel}>{cmd.label}</span>
                <span className={styles.itemGroup}>{cmd.group}</span>
              </button>
            ))}
          </div>
          {filtered.length > 0 && (
            <div className={styles.footer}>
              <span className={styles.footerHint}>
                <CornerDownLeft size={12} strokeWidth={1.75} aria-hidden />
                {ts('common.confirm')}
              </span>
            </div>
          )}
        </div>
      </GlassLens>
    </div>
  )
}
