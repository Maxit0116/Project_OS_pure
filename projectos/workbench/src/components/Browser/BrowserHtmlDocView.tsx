import { FileCode2 } from 'lucide-react'
import { useI18n } from '../../i18n'
import { useBrowserStore } from '../../state/browserStore'
import EmptyState from '../ui/EmptyState'
import styles from './BrowserPanel.module.css'

/** Renders the active agent/user HTML document in the Browser center pane. */
export default function BrowserHtmlDocView() {
  const { ts } = useI18n()
  const doc = useBrowserStore((s) => s.getActiveHtmlDoc())

  if (!doc) {
    return (
      <EmptyState
        icon={<FileCode2 size={16} strokeWidth={1.5} aria-hidden />}
        title={ts('browser.sidebar.docsEmptyTitle')}
        description={ts('browser.sidebar.docsEmpty')}
      />
    )
  }

  return (
    <iframe
      className={styles.htmlDocFrame}
      title={doc.title}
      sandbox="allow-scripts allow-same-origin"
      srcDoc={doc.html}
      data-browser-html-doc={doc.id}
    />
  )
}
