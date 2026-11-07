import { FileCode2, Globe, Plus, X } from 'lucide-react'
import { useI18n } from '../../i18n'
import { useBrowserStore, isBrowserHomeTab } from '../../state/browserStore'
import TabBar from '../ui/TabBar'
import styles from './BrowserSidebar.module.css'

/**
 * Browser-only left rail: Chrome-style vertical URL tabs + agent HTML docs.
 * Mode switch (Pages | Docs) is optional — user picks which vertical list to work with.
 */
export default function BrowserSidebar() {
  const { ts } = useI18n()
  const sidebarMode = useBrowserStore((s) => s.sidebarMode)
  const setSidebarMode = useBrowserStore((s) => s.setSidebarMode)
  const tabs = useBrowserStore((s) => s.tabs)
  const activeTabId = useBrowserStore((s) => s.activeTabId)
  const switchTab = useBrowserStore((s) => s.switchTab)
  const closeTab = useBrowserStore((s) => s.closeTab)
  const createTab = useBrowserStore((s) => s.createTab)
  const htmlDocs = useBrowserStore((s) => s.htmlDocs)
  const activeHtmlDocId = useBrowserStore((s) => s.activeHtmlDocId)
  const createHtmlDoc = useBrowserStore((s) => s.createHtmlDoc)
  const closeHtmlDoc = useBrowserStore((s) => s.closeHtmlDoc)
  const switchHtmlDoc = useBrowserStore((s) => s.switchHtmlDoc)

  const modeTabs = [
    { id: 'pages', label: ts('browser.sidebar.pages') },
    { id: 'docs', label: ts('browser.sidebar.docs') },
  ]

  return (
    <div className={styles.root} data-browser-sidebar="">
      <div className={styles.modeBar}>
        <TabBar
          tabs={modeTabs}
          activeId={sidebarMode}
          onChange={(id) => setSidebarMode(id as 'pages' | 'docs')}
          size="sm"
          chrome="nested"
        />
      </div>

      {sidebarMode === 'pages' ? (
        <div className={styles.rail}>
          <div className={styles.list} role="tablist" aria-label={ts('browser.sidebar.pagesList')}>
            {tabs.map((tab) => {
              const label = isBrowserHomeTab(tab)
                ? ts('browser.homeTab')
                : tab.title || ts('browser.untitledTab')
              const active = tab.id === activeTabId
              return (
                <div
                  key={tab.id}
                  className={`${styles.row} ${active ? styles.rowActive : ''}`}
                  role="tab"
                  aria-selected={active}
                  title={isBrowserHomeTab(tab) ? ts('browser.homeTab') : tab.url || label}
                  onClick={() => switchTab(tab.id)}
                >
                  <Globe size={14} strokeWidth={1.75} className={styles.rowIcon} aria-hidden />
                  <span className={styles.rowTitle}>{label}</span>
                  <button
                    type="button"
                    className={styles.rowClose}
                    aria-label={ts('browser.closeTab')}
                    onClick={(event) => {
                      event.stopPropagation()
                      closeTab(tab.id)
                    }}
                  >
                    <X size={14} strokeWidth={2.25} aria-hidden />
                  </button>
                </div>
              )
            })}
          </div>
          <div className={styles.footer}>
            <button
              type="button"
              className={styles.newBtn}
              onClick={() => createTab()}
              aria-label={ts('browser.newTab')}
            >
              <Plus size={14} strokeWidth={2} aria-hidden />
              {ts('browser.newTab')}
            </button>
          </div>
        </div>
      ) : (
        <div className={styles.rail}>
          {htmlDocs.length === 0 ? (
            <div className={styles.empty} role="status">
              {ts('browser.sidebar.docsEmpty')}
            </div>
          ) : (
            <div className={styles.list} role="tablist" aria-label={ts('browser.sidebar.docsList')}>
              {htmlDocs.map((doc) => {
                const active = doc.id === activeHtmlDocId
                return (
                  <div
                    key={doc.id}
                    className={`${styles.row} ${active ? styles.rowActive : ''}`}
                    role="tab"
                    aria-selected={active}
                    title={doc.title}
                    onClick={() => switchHtmlDoc(doc.id)}
                  >
                    <FileCode2 size={14} strokeWidth={1.75} className={styles.rowIcon} aria-hidden />
                    <span className={styles.rowTitle}>{doc.title}</span>
                    <button
                      type="button"
                      className={styles.rowClose}
                      aria-label={ts('browser.sidebar.closeDoc')}
                      onClick={(event) => {
                        event.stopPropagation()
                        closeHtmlDoc(doc.id)
                      }}
                    >
                      <X size={14} strokeWidth={2.25} aria-hidden />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
          <div className={styles.footer}>
            <button
              type="button"
              className={styles.newBtn}
              onClick={() => createHtmlDoc()}
              aria-label={ts('browser.sidebar.newDoc')}
            >
              <Plus size={14} strokeWidth={2} aria-hidden />
              {ts('browser.sidebar.newDoc')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
