import { Globe, X } from 'lucide-react'
import { memo, useCallback, type MouseEvent, type PointerEvent } from 'react'
import { useI18n } from '../../i18n'
import { useBrowserStore, isBrowserHomeTab } from '../../state/browserStore'
import styles from './BrowserPanel.module.css'

interface Props {
  tabId: string
  isActive: boolean
  isCompressed: boolean
  onTitlePointerDown: (tabId: string, event: PointerEvent<HTMLSpanElement>) => void
  onTitleClick: (event: MouseEvent<HTMLSpanElement>) => void
  onSelect: (tabId: string) => void
  onClose: (tabId: string) => void
  setTabRef: (tabId: string, el: HTMLDivElement | null) => void
}

function BrowserTabItem({
  tabId,
  isActive,
  isCompressed,
  onTitlePointerDown,
  onTitleClick,
  onSelect,
  onClose,
  setTabRef,
}: Props) {
  const { ts } = useI18n()
  const tab = useBrowserStore((s) => s.tabs.find((t) => t.id === tabId))

  const handleRef = useCallback(
    (el: HTMLDivElement | null) => {
      setTabRef(tabId, el)
    },
    [setTabRef, tabId],
  )

  const handleTitlePointerDown = useCallback(
    (event: PointerEvent<HTMLSpanElement>) => {
      onTitlePointerDown(tabId, event)
    },
    [onTitlePointerDown, tabId],
  )

  if (!tab) return null

  const tabLabel = isBrowserHomeTab(tab)
    ? ts('browser.homeTab')
    : tab.title || ts('browser.untitledTab')

  return (
    <div
      ref={handleRef}
      className={`${styles.tab} ${isActive ? styles.tabActive : ''}`}
      onClick={() => onSelect(tabId)}
      role="tab"
      aria-selected={isActive}
      title={isBrowserHomeTab(tab) ? ts('browser.homeTab') : tab.url}
    >
      <Globe size={12} strokeWidth={1.75} className={styles.tabIcon} aria-hidden />
      <span
        onPointerDown={handleTitlePointerDown}
        onClick={onTitleClick}
        className={`${styles.tabTitle} ${styles.tabTitleDraggable} ${
          isCompressed ? styles.tabTitleCompressed : ''
        }`}
      >
        {tabLabel}
      </span>
      <button
        type="button"
        className={styles.tabClose}
        aria-label={ts('browser.closeTab')}
        onClick={(e) => {
          e.stopPropagation()
          onClose(tabId)
        }}
      >
        <X size={16} strokeWidth={2.25} />
      </button>
    </div>
  )
}

export default memo(BrowserTabItem)
