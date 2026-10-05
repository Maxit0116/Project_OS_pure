import { type FormEvent } from 'react'
import { ArrowLeft, ArrowRight, ExternalLink, RotateCw } from 'lucide-react'
import { useBrowserStore, isBrowserHomeTab } from '../../state/browserStore'
import { useI18n } from '../../i18n'
import Button from '../ui/Button'
import styles from './BrowserPanel.module.css'

export default function BrowserToolbar() {
  const inputUrl = useBrowserStore((s) => s.inputUrl)
  const tabs = useBrowserStore((s) => s.tabs)
  const activeTabId = useBrowserStore((s) => s.activeTabId)
  const setInputUrl = useBrowserStore((s) => s.setInputUrl)
  const navigate = useBrowserStore((s) => s.navigate)
  const goBack = useBrowserStore((s) => s.goBack)
  const goForward = useBrowserStore((s) => s.goForward)
  const reload = useBrowserStore((s) => s.reload)
  const openExternal = useBrowserStore((s) => s.openExternal)
  const { ts } = useI18n()

  const activeTab = tabs.find((t) => t.id === activeTabId)
  const isHome = isBrowserHomeTab(activeTab)
  const isLoading = activeTab?.isLoading ?? false
  const canGoBack = !isHome && (activeTab?.canGoBack ?? false)
  const canGoForward = !isHome && (activeTab?.canGoForward ?? false)

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    navigate()
  }

  return (
    <div className={styles.toolbar}>
      <div className={styles.navActions}>
        <Button
          variant="ghost"
          size="sm"
          onClick={goBack}
          disabled={!canGoBack}
          aria-label={ts('browser.back')}
          title={ts('browser.back')}
        >
          <ArrowLeft size={16} strokeWidth={1.75} aria-hidden />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={goForward}
          disabled={!canGoForward}
          aria-label={ts('browser.forward')}
          title={ts('browser.forward')}
        >
          <ArrowRight size={16} strokeWidth={1.75} aria-hidden />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={reload}
          disabled={isHome}
          aria-label={ts('browser.reload')}
          title={ts('browser.reload')}
        >
          <RotateCw size={16} strokeWidth={1.75} className={isLoading ? styles.spin : ''} aria-hidden />
        </Button>
      </div>

      <form className={styles.urlForm} onSubmit={handleSubmit}>
        <input
          type="text"
          className={styles.urlInput}
          value={inputUrl}
          onChange={(event) => setInputUrl(event.target.value)}
          placeholder={ts('browser.urlPlaceholder')}
          spellCheck={false}
          aria-label={ts('browser.urlPlaceholder')}
        />
      </form>

      <Button
        variant="ghost"
        size="sm"
        onClick={() => void openExternal()}
        disabled={isHome}
        aria-label={ts('browser.openExternal')}
        title={ts('browser.openExternal')}
      >
        <ExternalLink size={16} strokeWidth={1.75} aria-hidden />
      </Button>
    </div>
  )
}
