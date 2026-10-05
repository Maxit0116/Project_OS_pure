import { useEffect, useState } from 'react'
import { useWorkbenchStore } from '../../state/workbenchStore'
import { resolveRelativeDocumentPath } from './markdownLinkUtils'
import styles from './MarkdownPreview.module.css'

interface Props {
  src?: string
  alt?: string
  documentPath?: string
}

export default function MarkdownWorkspaceImage({ src, alt, documentPath }: Props) {
  const client = useWorkbenchStore((s) => s.client)
  const project = useWorkbenchStore((s) => s.project)
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  const resolvedPath =
    src && documentPath && !isAbsoluteWebImage(src)
      ? resolveRelativeDocumentPath(documentPath, src)
      : null

  useEffect(() => {
    if (!src) return
    if (isAbsoluteWebImage(src)) {
      setDataUrl(src)
      setFailed(false)
      return
    }
    if (!resolvedPath || !project) {
      setDataUrl(null)
      setFailed(true)
      return
    }

    let cancelled = false
    setFailed(false)
    void client
      .getWorkspaceFileDataUrl(project.projectId, resolvedPath)
      .then((url) => {
        if (!cancelled) setDataUrl(url)
      })
      .catch(() => {
        if (!cancelled) {
          setDataUrl(null)
          setFailed(true)
        }
      })

    return () => {
      cancelled = true
    }
  }, [client, project, resolvedPath, src])

  if (dataUrl) {
    return <img className={styles.image} src={dataUrl} alt={alt ?? ''} loading="lazy" />
  }

  if (failed) {
    return (
      <span className={styles.imageFallback} title={resolvedPath ?? src}>
        {alt?.trim() || resolvedPath || src || 'Image'}
      </span>
    )
  }

  return <span className={styles.imageLoading}>{alt?.trim() || 'Loading image…'}</span>
}

function isAbsoluteWebImage(src: string): boolean {
  return /^https?:\/\//i.test(src)
}
