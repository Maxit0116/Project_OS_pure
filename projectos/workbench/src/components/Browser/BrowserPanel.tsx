import { Globe, Plus, X } from 'lucide-react'
import { useCallback, useLayoutEffect, useRef, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '../../i18n'
import { useBrowserStore, isBrowserHomeTab } from '../../state/browserStore'
import EmptyState from '../ui/EmptyState'
import BrowserTabItem from './BrowserTabItem'
import BrowserToolbar from './BrowserToolbar'
import BrowserWebview from './BrowserWebview'
import { useBrowserTabDrag } from './useBrowserTabDrag'
import { useBrowserTabLayout } from './useBrowserTabLayout'
import styles from './BrowserPanel.module.css'

function BrowserTabBar() {
  const tabCount = useBrowserStore((s) => s.tabs.length)
  const activeTabId = useBrowserStore((s) => s.activeTabId)
  const switchTab = useBrowserStore((s) => s.switchTab)
  const closeTab = useBrowserStore((s) => s.closeTab)
  const createTab = useBrowserStore((s) => s.createTab)
  const reorderTab = useBrowserStore((s) => s.reorderTab)
  const tabs = useBrowserStore((s) => s.tabs)
  const { ts } = useI18n()
  const { tabListRef, tabWidth, isCompressed, isScrollable } = useBrowserTabLayout(tabCount)
  const tabRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const prevTabCountRef = useRef(tabCount)
  const prevActiveTabIdRef = useRef(activeTabId)

  const {
    stripItems,
    dragTabId,
    ghost,
    isDragging,
    onTitlePointerDown,
    onTitleClick,
    shouldSuppressTabClick,
  } = useBrowserTabDrag({
    tabs,
    tabListRef,
    tabRefs,
    reorderTab,
    switchTab,
  })

  const ghostTab = ghost ? tabs.find((tab) => tab.id === ghost.tabId) : null

  const setTabRef = useCallback((tabId: string, el: HTMLDivElement | null) => {
    if (el) tabRefs.current.set(tabId, el)
    else tabRefs.current.delete(tabId)
  }, [])

  const handleSelectTab = useCallback(
    (tabId: string) => {
      if (!shouldSuppressTabClick()) {
        switchTab(tabId)
      }
    },
    [shouldSuppressTabClick, switchTab],
  )

  const handleCloseTab = useCallback(
    (tabId: string) => {
      closeTab(tabId)
    },
    [closeTab],
  )

  useLayoutEffect(() => {
    if (isDragging) return
    if (prevActiveTabIdRef.current === activeTabId && prevTabCountRef.current === tabCount) {
      return
    }

    const activeEl = tabRefs.current.get(activeTabId)
    prevActiveTabIdRef.current = activeTabId

    const addedTab = tabCount > prevTabCountRef.current
    prevTabCountRef.current = tabCount

    if (!activeEl) return

    activeEl.scrollIntoView({
      inline: addedTab ? 'end' : 'nearest',
      block: 'nearest',
      behavior: 'auto',
    })
  }, [activeTabId, isDragging, tabCount])

  return (
    <div className={styles.tabBar}>
      <div
        ref={tabListRef}
        role="tablist"
        className={`${styles.tabList} ${isScrollable ? styles.tabListScrollable : ''} ${
          isDragging ? styles.tabListDragging : ''
        }`}
        style={{ '--tab-width': `${tabWidth}px` } as CSSProperties}
      >
        {stripItems.map((item) => {
          if (item.kind === 'spacer') {
            return <div key="tab-drag-spacer" className={styles.tabSpacer} aria-hidden />
          }

          const tab = item.tab
          return (
            <BrowserTabItem
              key={tab.id}
              tabId={tab.id}
              isActive={tab.id === activeTabId}
              isCompressed={isCompressed}
              onTitlePointerDown={onTitlePointerDown}
              onTitleClick={onTitleClick}
              onSelect={handleSelectTab}
              onClose={handleCloseTab}
              setTabRef={setTabRef}
            />
          )
        })}
        <button
          type="button"
          className={styles.tabNew}
          aria-label={ts('browser.newTab')}
          title={ts('browser.newTab')}
          onClick={() => createTab()}
        >
          <Plus size={14} strokeWidth={2} />
        </button>
      </div>

      {ghost && ghostTab
        ? createPortal(
            <div
              className={`${styles.tabDragGhost} ${
                ghostTab.id === activeTabId || ghostTab.id === dragTabId
                  ? styles.tabDragGhostActive
                  : ''
              }`}
              style={{
                width: ghost.width,
                height: ghost.height,
                transform: `translate(${ghost.x}px, ${ghost.y}px)`,
              }}
            >
              <Globe size={12} strokeWidth={1.75} className={styles.tabIcon} aria-hidden />
              <span
                className={`${styles.tabTitle} ${
                  isCompressed ? styles.tabTitleCompressed : ''
                }`}
              >
                {isBrowserHomeTab(ghostTab)
                  ? ts('browser.homeTab')
                  : ghostTab.title || ts('browser.untitledTab')}
              </span>
              <span className={styles.tabDragGhostClose} aria-hidden>
                <X size={16} strokeWidth={2.25} />
              </span>
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}

export default function BrowserPanel() {
  const tabs = useBrowserStore((s) => s.tabs)
  const activeTabId = useBrowserStore((s) => s.activeTabId)
  const activeTab = tabs.find((t) => t.id === activeTabId)
  const isHome = isBrowserHomeTab(activeTab)
  const isLoading = activeTab?.isLoading ?? false
  const error = activeTab?.error ?? null
  const { ts } = useI18n()

  return (
    <div className={styles.panel} data-tour="browser">
      <BrowserTabBar />
      <BrowserToolbar />
      <div className={styles.viewport}>
        {isHome ? (
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
