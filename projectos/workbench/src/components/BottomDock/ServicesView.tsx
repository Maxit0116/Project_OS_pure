import { useEffect } from 'react'
import { Globe } from 'lucide-react'
import { useServicesStore } from '../../state/servicesStore'
import { useBrowserStore } from '../../state/browserStore'
import { useWorkbenchStore } from '../../state/workbenchStore'
import { useI18n } from '../../i18n'
import styles from './ServicesView.module.css'

export default function ServicesView() {
  const ports = useServicesStore((s) => s.ports)
  const startWatch = useServicesStore((s) => s.startWatch)
  const stopWatch = useServicesStore((s) => s.stopWatch)
  const { ts } = useI18n()

  useEffect(() => {
    void startWatch()
    return () => {
      void stopWatch()
    }
  }, [startWatch, stopWatch])

  const openInBrowser = (url: string) => {
    useBrowserStore.getState().openOrSwitchTab(url)
    useWorkbenchStore.getState().setCenterTab('browser')
  }

  return (
    <div className={styles.servicesView}>
      <div className={styles.toolbar}>
        <p className={styles.hint}>{ts('services.hint')}</p>
      </div>
      <div className={styles.list}>
        {ports.length === 0 ? (
          <p className={styles.empty}>{ts('services.empty')}</p>
        ) : (
          ports.map((port) => (
            <div key={port.id} className={styles.row}>
              <div className={styles.meta}>
                <div className={styles.label}>
                  {port.label}
                  <span className={styles.status}>{port.status}</span>
                </div>
                <div className={styles.url}>{port.url}</div>
              </div>
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.actionBtn}
                  onClick={() => openInBrowser(port.url)}
                >
                  <Globe size={12} aria-hidden />
                  {ts('services.openInBrowser')}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
