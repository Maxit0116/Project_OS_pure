import { useLayoutEffect, useMemo, useRef } from 'react'
import { useI18n } from '../../i18n'
import { useWorkbenchStore } from '../../state/workbenchStore'
import { codeNodeDisplayTitle, codeNodeFilePath, isCodeElementNode } from './codeNodeInteraction'
import { nodePreviewBody } from './nodeCopy'
import { useFunctionMap } from './FunctionMapContext'
import styles from './FunctionMap.module.css'

export default function FunctionMapNodePreview() {
  const { hoverPreview, canDrillIntoNode, architecture, reportPreviewMetrics } = useFunctionMap()
  const previewRef = useRef<HTMLElement>(null)
  const locale = useWorkbenchStore((s) => s.locale)
  const { ts } = useI18n()

  const layerLabelById = useMemo(
    () => new Map((architecture?.layers ?? []).map((layer) => [layer.id, layer.label])),
    [architecture],
  )

  useLayoutEffect(() => {
    const el = previewRef.current
    if (!el || !hoverPreview) return

    const measure = () => {
      reportPreviewMetrics({
        width: el.offsetWidth,
        height: el.offsetHeight,
      })
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [hoverPreview, reportPreviewMetrics])

  if (!hoverPreview) return null

  if (hoverPreview.kind === 'cluster') {
    const { cluster } = hoverPreview
    return (
      <aside
        ref={previewRef}
        className={`${styles.nodePreview} ${styles.nodePreviewFixed} glass-enter`}
        style={{ left: hoverPreview.x, top: hoverPreview.y }}
        aria-live="polite"
      >
        <div className={styles.nodePreviewTitle}>{cluster.label}</div>
        {cluster.description ? (
          <p className={styles.nodePreviewSummary}>{cluster.description}</p>
        ) : null}
        <div className={styles.nodePreviewMeta}>
          <span>{layerLabelById.get(cluster.layerId) ?? cluster.layerId}</span>
        </div>
        <div className={styles.nodePreviewHint}>{ts('map.cluster.expandHint')}</div>
      </aside>
    )
  }

  const { node } = hoverPreview
  const isCodeElement = isCodeElementNode(node)
  const displayTitle = isCodeElement ? codeNodeDisplayTitle(node) : node.name
  const filePath = isCodeElement ? codeNodeFilePath(node) : undefined
  const previewBody = nodePreviewBody(node)
  const previewText = previewBody && previewBody !== displayTitle ? previewBody : undefined

  return (
    <aside
      ref={previewRef}
      className={`${styles.nodePreview} ${styles.nodePreviewFixed} glass-enter`}
      style={{ left: hoverPreview.x, top: hoverPreview.y }}
      aria-live="polite"
    >
      <div className={styles.nodePreviewTitle}>{displayTitle}</div>
      {isCodeElement && filePath && (
        <div className={styles.nodePreviewSubtitle} title={filePath}>
          {filePath}
        </div>
      )}
      {!isCodeElement && locale === 'en' && node.nameEn && (
        <div className={styles.nodePreviewSubtitle}>{node.nameEn}</div>
      )}
      {previewText ? <p className={styles.nodePreviewSummary}>{previewText}</p> : null}
      <div className={styles.nodePreviewMeta}>
        <span>{ts(`map.elementTypes.${node.elementType ?? 'fallback'}`)}</span>
        {node.layer && <span>{layerLabelById.get(node.layer)}</span>}
        <span>{ts('map.previewFiles', { count: node.linkedFiles.length })}</span>
      </div>
      {!node.elementType && node.tags.length > 0 && (
        <div className={styles.nodePreviewTags}>
          {node.tags.slice(0, 3).map((tag) => (
            <span key={tag} className={styles.nodePreviewTag}>
              {tag}
            </span>
          ))}
        </div>
      )}
      <div className={styles.nodePreviewHint}>
        {canDrillIntoNode(node.id)
          ? node.level === 'context'
            ? ts('map.node.openSystemMap')
            : node.level === 'container'
              ? ts('map.node.openModuleMap')
              : ts('map.node.openGraph')
          : ts('map.previewHint')}
      </div>
    </aside>
  )
}
