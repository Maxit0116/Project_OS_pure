import { useWorkbenchStore } from '../state/workbenchStore'
import { useI18n } from '../i18n'
import { resolveDesktopTitleBarLabel } from './resolveDesktopTitleBarLabel'
import styles from './DesktopTitleBar.module.css'

export default function DesktopTitleBarLabel() {
  const { ts } = useI18n()
  const project = useWorkbenchStore((s) => s.project)
  const graph = useWorkbenchStore((s) => s.graph)
  const mapContent = useWorkbenchStore((s) => s.mapContent)
  const selectedNodeId = useWorkbenchStore((s) => s.selectedNodeId)
  const selectedArtifactId = useWorkbenchStore((s) => s.selectedArtifactId)
  const globalAgentActive = useWorkbenchStore((s) => s.globalAgentActive)

  const label = resolveDesktopTitleBarLabel({
    project,
    graph,
    mapContent,
    selectedNodeId,
    selectedArtifactId,
    globalAgentActive,
    globalScopeLabel: ts('context.scopeGlobal'),
    untitledLabel: ts('mapArtifacts.untitledTitle'),
  })

  if (!label) return null

  return (
    <span className={styles.label} title={label}>
      {label}
    </span>
  )
}
