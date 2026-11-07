import { Globe } from 'lucide-react'
import { useI18n } from '../../i18n'
import { useBrowserStore, isBrowserHomeTab } from '../../state/browserStore'
import EmptyState from '../ui/EmptyState'
import BrowserHtmlDocView from './BrowserHtmlDocView'
import BrowserToolbar from './BrowserToolbar'
import BrowserWebview from './BrowserWebview'
import styles from './BrowserPanel.module.css'

export default function BrowserPanel() {
  const tabs = useBrowserStore((s) => s.tabs)
  const activeTabId = useBrowserStore((s) => s.activeTabId)
  const sidebarMode = useBrowserStore((s) => s.sidebarMode)
  const activeTab = tabs.find((t) => t.id === activeTabId)
  const isHome = isBrowserHomeTab(activeTab)
  const isLoading = activeTab?.isLoading ?? false
  const error = activeTab?.error ?? null
  const { ts } = useI18n()

  const showDocs = sidebarMode === 'docs'

  return (
    <div className={styles.panel} data-tour="browser">
      {!showDocs ? <BrowserToolbar /> : null}
      <div className={styles.viewport}>
        {showDocs ? (
          <BrowserHtmlDocView />
        ) : isHome ? (
          <EmptyState
            icon={<Globe size={16} strokeWidth={1.5} aria-hidden />}
            title={ts('browser.emptyTitle')}
            description={ts('browser.emptyDesc')}
          />
        ) : (
          <>
            <BrowserWebview />
            {isLoading && (
              <div className={styles.overlay} aria-live="polite" aria-busy="true">
                <span className={styles.overlayText}>{ts('browser.loading')}</span>
              </div>
            )}
            {error && !isLoading && (
              <div className={styles.overlay} role="alert">
                <span className={styles.overlayText}>{error}</span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
