import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft } from 'lucide-react'
import { useI18n } from '../../i18n'
import { useWorkbenchStore } from '../../state/workbenchStore'
import Button from '../ui/Button'
import { GlassLens } from '../Glass'
import {
  handleTopmostOverlayEscape,
  isTopmostOverlay,
  registerOverlay,
} from '../overlays/overlayStack'
import SettingsNavRow from './SettingsNavRow'
import LanguageSettingsSection from './LanguageSettingsSection'
import ThemeSettingsSection from './ThemeSettingsSection'
import GeneralSettingsSection from './GeneralSettingsSection'
import ModelProfilesSection from './ModelProfilesSection'
import AgentProfilesSection from './AgentProfilesSection'
import NotificationSettingsSection from './NotificationSettingsSection'
import ProjectDescriptionSection from './ProjectDescriptionSection'
import SpatialPinSettingsSection from './SpatialPinSettingsSection'
import HarnessSettingsSection from './HarnessSettingsSection'
import McpServersSection from './McpServersSection'
import TeamGithubSection from './TeamGithubSection'
import { trapDialogTab } from './settingsDialogFocus'
import styles from './SettingsPanel.module.css'

type SettingsView =
  | 'hub'
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

const SETTINGS_VIEWS = new Set<SettingsView>([
  'hub',
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
])

interface Props {
  onClose: () => void
}

export default function SettingsPanel({ onClose }: Props) {
  const settings = useWorkbenchStore((s) => s.settings)
  const locale = useWorkbenchStore((s) => s.locale)
  const themePreference = useWorkbenchStore((s) => s.themePreference)
  const notifyOnDiffReady = useWorkbenchStore((s) => s.notifyOnDiffReady)
  const githubAuthStatus = useWorkbenchStore((s) => s.githubAuthStatus)
  const settingsFocusView = useWorkbenchStore((s) => s.settingsFocusView)
  const clearSettingsFocusView = useWorkbenchStore((s) => s.clearSettingsFocusView)
  const { ts } = useI18n()
  const [view, setView] = useState<SettingsView>('hub')
  const dialogRef = useRef<HTMLDivElement>(null)
  const overlayTokenRef = useRef(Symbol('settings-dialog'))
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const dialogMounted = Boolean(settings)

  useEffect(() => {
    if (!settingsFocusView) return
    if (SETTINGS_VIEWS.has(settingsFocusView as SettingsView)) {
      setView(settingsFocusView as SettingsView)
    }
    clearSettingsFocusView()
  }, [settingsFocusView, clearSettingsFocusView])

  useEffect(() => {
    if (!dialogMounted) return
    const token = overlayTokenRef.current
    const unregisterOverlay = registerOverlay(token)
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    const focusableElements = () => {
      const dialog = dialogRef.current
      if (!dialog) return []
      return Array.from(dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      )).filter((element) => !element.hasAttribute('inert'))
    }

    const initialFocusTarget = focusableElements()[0] ?? dialogRef.current
    initialFocusTarget?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (handleTopmostOverlayEscape(e, token, () => onCloseRef.current())) return
      if (e.key !== 'Tab' || !isTopmostOverlay(token)) return
      if (trapDialogTab(focusableElements(), document.activeElement as HTMLElement | null, e.shiftKey)) {
        e.preventDefault()
        e.stopPropagation()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      unregisterOverlay()
      if (previouslyFocused?.isConnected) previouslyFocused.focus()
    }
  }, [dialogMounted])

  if (!settings) return null

  const hubItems: { id: SettingsView; label: string; summary: string }[] = [
    {
      id: 'project',
      label: ts('settings.projectDescriptionTitle'),
      summary: ts('settings.projectDescriptionSummary'),
    },
    { id: 'language', label: ts('settings.language'), summary: ts(`settings.languageOptions.${locale}`) },
    { id: 'theme', label: ts('settings.theme'), summary: ts(`settings.themeOptions.${themePreference}`) },
    {
      id: 'notifications',
      label: ts('settings.tabs.notifications'),
      summary: notifyOnDiffReady ? ts('settings.notificationsSummary') : ts('settings.notificationsOff'),
    },
    { id: 'general', label: ts('settings.tabs.general'), summary: settings.presentationMode ? ts('settings.realDemoSummaryDemo') : ts('settings.realDemoSummaryReal') },
    { id: 'models', label: ts('settings.tabs.models'), summary: ts('settings.modelsSummary', { count: settings.modelProfiles.length }) },
    { id: 'agents', label: ts('settings.tabs.agents'), summary: ts('settings.agentsSummary', { count: settings.agentProfiles.length }) },
    {
      id: 'mcp',
      label: ts('settings.tabs.mcp'),
      summary: ts('settings.mcp.summary', { count: settings.mcpServers?.length ?? 0 }),
    },
    {
      id: 'teamGithub',
      label: ts('settings.tabs.teamGithub'),
      summary: githubAuthStatus?.connected && githubAuthStatus.login
        ? ts('settings.teamGithub.summaryConnected', { login: githubAuthStatus.login })
        : ts('settings.teamGithub.summaryNotConnected'),
    },
    {
      id: 'spatialPin',
      label: ts('settings.tabs.spatialPin'),
      summary: ts('settings.spatialPinSummary'),
    },
    {
      id: 'harness',
      label: ts('settings.tabs.harness'),
      summary: ts('settings.harness.summary'),
    },
  ]

  const viewTitle =
    view === 'hub'
      ? ts('settings.title')
      : hubItems.find((item) => item.id === view)?.label ?? ts('settings.title')

  return createPortal(
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label={ts('settings.title')}>
      <button type="button" className={styles.backdrop} onClick={onClose} aria-label={ts('common.close')} />
      <GlassLens radius={24} tint="overlay" className={styles.panel}>
        <div ref={dialogRef} className={styles.panelInner} tabIndex={-1}>
          <header className={styles.header}>
            <div className={styles.headerTitle}>
              {view !== 'hub' && (
                <button
                  type="button"
                  className={styles.backBtn}
                  onClick={() => setView('hub')}
                  aria-label={ts('settings.back')}
                >
                  <ArrowLeft size={16} strokeWidth={1.75} aria-hidden />
                </button>
              )}
              <h2 className={styles.title}>{viewTitle}</h2>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose} aria-label={ts('common.close')}>
              ×
            </Button>
          </header>

          <div className={styles.body}>
            {view === 'hub' && (
              <div className={styles.hub}>
                <p className={styles.hubIntro}>{ts('settings.hubIntro')}</p>
                <nav className={styles.navList} aria-label={ts('settings.title')}>
                  {hubItems.map((item) => (
                    <SettingsNavRow
                      key={item.id}
                      label={item.label}
                      summary={item.summary}
                      onClick={() => setView(item.id)}
                    />
                  ))}
                </nav>
              </div>
            )}
            {view === 'language' && <LanguageSettingsSection />}
            {view === 'theme' && <ThemeSettingsSection />}
            {view === 'notifications' && <NotificationSettingsSection />}
            {view === 'general' && <GeneralSettingsSection />}
            {view === 'project' && <ProjectDescriptionSection />}
            {view === 'models' && <ModelProfilesSection />}
            {view === 'agents' && <AgentProfilesSection />}
            {view === 'mcp' && <McpServersSection />}
            {view === 'teamGithub' && <TeamGithubSection />}
            {view === 'spatialPin' && <SpatialPinSettingsSection />}
            {view === 'harness' && <HarnessSettingsSection />}
          </div>
        </div>
      </GlassLens>
    </div>,
    document.body,
  )
}
