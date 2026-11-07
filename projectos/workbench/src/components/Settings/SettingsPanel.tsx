import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Bell,
  Bot,
  Crosshair,
  FileText,
  GitBranch,
  Languages,
  Palette,
  Plug,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Wrench,
  X,
  type LucideIcon,
} from 'lucide-react'
import { sessionGraphShieldCssInsets } from '@contracts/index'
import { useI18n } from '../../i18n'
import { useBottomDockStore } from '../../state/bottomDockStore'
import { useWorkbenchStore } from '../../state/workbenchStore'
import { GraphOverlayFrame } from '../GraphOverlay/GraphOverlayFrame'
import AgentProfilesSection from './AgentProfilesSection'
import GeneralSettingsSection from './GeneralSettingsSection'
import HarnessSettingsSection from './HarnessSettingsSection'
import LanguageSettingsSection from './LanguageSettingsSection'
import McpServersSection from './McpServersSection'
import ModelProfilesSection from './ModelProfilesSection'
import NotificationSettingsSection from './NotificationSettingsSection'
import ProjectDescriptionSection from './ProjectDescriptionSection'
import SettingsNavRow from './SettingsNavRow'
import SpatialPinSettingsSection from './SpatialPinSettingsSection'
import TeamGithubSection from './TeamGithubSection'
import VerificationSettingsSection from './VerificationSettingsSection'
import ThemeSettingsSection from './ThemeSettingsSection'
import styles from './SettingsPanel.module.css'

export type SettingsView =
  | 'language'
  | 'theme'
  | 'notifications'
  | 'general'
  | 'project'
  | 'models'
  | 'agents'
  | 'mcp'
  | 'teamGithub'
  | 'spatialPin'
  | 'harness'
  | 'verification'

const SETTINGS_VIEWS = new Set<string>([
  'language',
  'theme',
  'notifications',
  'general',
  'project',
  'models',
  'agents',
  'mcp',
  'teamGithub',
  'spatialPin',
  'harness',
  'verification',
])

const DEFAULT_VIEW: SettingsView = 'project'

interface NavItem {
  id: SettingsView
  labelKey: string
  icon: LucideIcon
}

interface NavGroup {
  id: string
  labelKey: string
  items: NavItem[]
}

const NAV_GROUPS: NavGroup[] = [
  {
    id: 'preferences',
    labelKey: 'settings.navGroups.preferences',
    items: [
      { id: 'project', labelKey: 'settings.projectDescriptionTitle', icon: FileText },
      { id: 'general', labelKey: 'settings.tabs.general', icon: Settings2 },
      { id: 'language', labelKey: 'settings.language', icon: Languages },
      { id: 'theme', labelKey: 'settings.theme', icon: Palette },
      { id: 'notifications', labelKey: 'settings.tabs.notifications', icon: Bell },
    ],
  },
  {
    id: 'intelligence',
    labelKey: 'settings.navGroups.intelligence',
    items: [
      { id: 'models', labelKey: 'settings.tabs.models', icon: Sparkles },
      { id: 'agents', labelKey: 'settings.tabs.agents', icon: Bot },
      { id: 'mcp', labelKey: 'settings.tabs.mcp', icon: Plug },
      { id: 'verification', labelKey: 'settings.tabs.verification', icon: ShieldCheck },
    ],
  },
  {
    id: 'connections',
    labelKey: 'settings.navGroups.connections',
    items: [
      { id: 'teamGithub', labelKey: 'settings.tabs.teamGithub', icon: GitBranch },
      { id: 'spatialPin', labelKey: 'settings.tabs.spatialPin', icon: Crosshair },
      { id: 'harness', labelKey: 'settings.tabs.harness', icon: Wrench },
    ],
  },
]

function resolveView(candidate: string | null | undefined): SettingsView {
  if (candidate && SETTINGS_VIEWS.has(candidate)) return candidate as SettingsView
  return DEFAULT_VIEW
}

export default function SettingsPanel() {
  const open = useWorkbenchStore((s) => s.settingsOpen)
  const setSettingsOpen = useWorkbenchStore((s) => s.setSettingsOpen)
  const settings = useWorkbenchStore((s) => s.settings)
  const settingsFocusView = useWorkbenchStore((s) => s.settingsFocusView)
  const clearSettingsFocusView = useWorkbenchStore((s) => s.clearSettingsFocusView)
  const leftPanelOpen = useWorkbenchStore((s) => s.leftPanelOpen)
  const rightPanelOpen = useWorkbenchStore((s) => s.rightPanelOpen)
  const panelResizing = useWorkbenchStore((s) => s.panelResizing)
  const terminalOpen = useBottomDockStore((s) => s.open)
  const { ts } = useI18n()

  const [view, setView] = useState<SettingsView>(DEFAULT_VIEW)
  const [query, setQuery] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  const shield = sessionGraphShieldCssInsets({
    leftOpen: leftPanelOpen,
    rightOpen: rightPanelOpen,
    terminalOpen,
  })

  useEffect(() => {
    if (!open) {
      setQuery('')
      return
    }
    if (settingsFocusView) {
      setView(resolveView(settingsFocusView))
      clearSettingsFocusView()
    }
  }, [open, settingsFocusView, clearSettingsFocusView])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setSettingsOpen(false)
        return
      }
      const isFind =
        (event.key === 'f' || event.key === 'F') &&
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        !event.shiftKey
      if (!isFind) return
      event.preventDefault()
      searchRef.current?.focus()
      searchRef.current?.select()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, setSettingsOpen])

  const normalizedQuery = query.trim().toLowerCase()

  const filteredGroups = useMemo(() => {
    return NAV_GROUPS.map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (!normalizedQuery) return true
        const label = ts(item.labelKey).toLowerCase()
        return label.includes(normalizedQuery)
      }),
    })).filter((group) => group.items.length > 0)
  }, [normalizedQuery, ts])

  const activeLabel = useMemo(() => {
    for (const group of NAV_GROUPS) {
      const hit = group.items.find((item) => item.id === view)
      if (hit) return ts(hit.labelKey)
    }
    return ts('settings.title')
  }, [view, ts])

  if (!open || !settings) return null

  return (
    <GraphOverlayFrame
      shield={shield}
      resizing={panelResizing}
      label={ts('settings.title')}
    >
      <div className={styles.shell} data-settings-overlay="">
        <aside className={styles.sidebar}>
          <div className={styles.sidebarHeader}>
            <h2 className={styles.sidebarTitle}>{ts('settings.title')}</h2>
          </div>
          <label className={styles.searchField}>
            <Search size={14} strokeWidth={1.75} className={styles.searchIcon} aria-hidden />
            <input
              ref={searchRef}
              type="search"
              className={styles.searchInput}
              value={query}
              placeholder={ts('settings.searchPlaceholder')}
              aria-label={ts('settings.searchAria')}
              onChange={(event) => setQuery(event.target.value)}
            />
            <kbd className={styles.searchHint}>
              {typeof navigator !== 'undefined' && /mac/i.test(navigator.platform)
                ? ts('settings.searchShortcutMac')
                : ts('settings.searchShortcutWin')}
            </kbd>
          </label>
          <nav className={styles.nav} aria-label={ts('settings.title')}>
            {filteredGroups.length === 0 ? (
              <p className={styles.navEmpty}>{ts('settings.searchEmpty')}</p>
            ) : (
              filteredGroups.map((group) => (
                <div key={group.id} className={styles.navGroup}>
                  <div className={styles.navGroupLabel}>{ts(group.labelKey)}</div>
                  {group.items.map((item) => (
                    <SettingsNavRow
                      key={item.id}
                      label={ts(item.labelKey)}
                      icon={item.icon}
                      active={view === item.id}
                      onClick={() => setView(item.id)}
                    />
                  ))}
                </div>
              ))
            )}
          </nav>
        </aside>

        <div className={styles.detail}>
          <header className={styles.detailHeader}>
            <h2 className={styles.detailTitle}>{activeLabel}</h2>
            <button
              type="button"
              className={styles.closeButton}
              aria-label={ts('settings.close')}
              onClick={() => setSettingsOpen(false)}
            >
              <X size={16} aria-hidden />
            </button>
          </header>
          <div className={styles.detailBody}>
            {view === 'project' && <ProjectDescriptionSection />}
            {view === 'general' && <GeneralSettingsSection />}
            {view === 'language' && <LanguageSettingsSection />}
            {view === 'theme' && <ThemeSettingsSection />}
            {view === 'notifications' && <NotificationSettingsSection />}
            {view === 'models' && <ModelProfilesSection />}
            {view === 'agents' && <AgentProfilesSection />}
            {view === 'mcp' && <McpServersSection />}
            {view === 'teamGithub' && <TeamGithubSection />}
            {view === 'spatialPin' && <SpatialPinSettingsSection />}
            {view === 'harness' && <HarnessSettingsSection />}
            {view === 'verification' && <VerificationSettingsSection />}
          </div>
        </div>
      </div>
    </GraphOverlayFrame>
  )
}
