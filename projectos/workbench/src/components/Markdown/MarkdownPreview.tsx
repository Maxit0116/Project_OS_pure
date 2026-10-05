import { type MouseEvent, type ReactNode, useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import MarkdownWorkspaceImage from './MarkdownWorkspaceImage'
import {
  findHeadingLine,
  isAbsoluteWebUrl,
  isWorkspaceRelativePath,
  restrictMarkdownUrl,
  resolveRelativeDocumentPath,
  slugifyHeading,
  splitDocumentHref,
} from './markdownLinkUtils'
import styles from './MarkdownPreview.module.css'

export { restrictMarkdownUrl } from './markdownLinkUtils'

function flattenText(children: ReactNode): string {
  if (typeof children === 'string' || typeof children === 'number') return String(children)
  if (Array.isArray(children)) return children.map(flattenText).join('')
  if (children && typeof children === 'object' && 'props' in children) {
    return flattenText((children as { props: { children?: ReactNode } }).props.children)
  }
  return ''
}

function openMarkdownLink(event: MouseEvent<HTMLAnchorElement>, href: string): void {
  if (!window.projectOS?.shell) return
  event.preventDefault()
  void window.projectOS.shell.openExternal(href).catch((error) => {
    console.error('[workbench] failed to open external markdown link', error)
  })
}

interface Props {
  content: string
  className?: string
  documentPath?: string
  onRevealSourceLine?: (line: number) => void
  onOpenDocument?: (path: string, headingSlug?: string) => void
  previewScrollRef?: React.RefObject<HTMLDivElement>
}

function createHeading(
  Tag: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6',
  content: string,
  onRevealSourceLine?: (line: number) => void,
) {
  return function MarkdownHeading({
    children,
    node: _node,
    ...props
  }: React.HTMLAttributes<HTMLHeadingElement> & { node?: unknown }) {
    const text = flattenText(children)
    const id = slugifyHeading(text)

    const revealFromHeading = (event: MouseEvent<HTMLAnchorElement>) => {
      event.preventDefault()
      const line = findHeadingLine(content, id)
      if (line) onRevealSourceLine?.(line)
    }

    return (
      <Tag id={id} className={styles.heading} {...props}>
        <span className={styles.headingText}>{children}</span>
        {onRevealSourceLine ? (
          <a
            href={`#${id}`}
            className={styles.headingAnchor}
            aria-label={`Reveal source for ${text}`}
            onClick={revealFromHeading}
          >
            #
          </a>
        ) : null}
      </Tag>
    )
  }
}

export default function MarkdownPreview({
  content,
  className,
  documentPath,
  onRevealSourceLine,
  onOpenDocument,
  previewScrollRef,
}: Props) {
  const components = useMemo(
    () => ({
      h1: createHeading('h1', content, onRevealSourceLine),
      h2: createHeading('h2', content, onRevealSourceLine),
      h3: createHeading('h3', content, onRevealSourceLine),
      h4: createHeading('h4', content, onRevealSourceLine),
      h5: createHeading('h5', content, onRevealSourceLine),
      h6: createHeading('h6', content, onRevealSourceLine),
      a: ({
        node: _node,
        href,
        children: linkChildren,
        ...props
      }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { node?: unknown }) => {
        if (!href) return <span>{linkChildren}</span>

        if (href.startsWith('#')) {
          const slug = href.slice(1)
          return (
            <a
              {...props}
              href={href}
              onClick={(event) => {
                event.preventDefault()
                const line = findHeadingLine(content, slug)
                if (line) {
                  onRevealSourceLine?.(line)
                  return
                }
                previewScrollRef?.current
                  ?.querySelector(`#${CSS.escape(slug)}`)
                  ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }}
            >
              {linkChildren}
            </a>
          )
        }

        if (documentPath && onOpenDocument && isWorkspaceRelativePath(href)) {
          const { path, hash } = splitDocumentHref(href)
          const targetPath = resolveRelativeDocumentPath(documentPath, path || href)
          if (targetPath) {
            return (
              <a
                {...props}
                href={href}
                onClick={(event) => {
                  event.preventDefault()
                  onOpenDocument(targetPath, hash || undefined)
                }}
              >
                {linkChildren}
              </a>
            )
          }
        }

        if (!isAbsoluteWebUrl(href)) return <span>{linkChildren}</span>

        return (
          <a
            {...props}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(event) => openMarkdownLink(event, href)}
          >
            {linkChildren}
          </a>
        )
      },
      img: ({
        src,
        alt,
      }: React.ImgHTMLAttributes<HTMLImageElement> & { node?: unknown }) => (
        <MarkdownWorkspaceImage src={typeof src === 'string' ? src : undefined} alt={alt} documentPath={documentPath} />
      ),
    }),
    [content, documentPath, onOpenDocument, onRevealSourceLine, previewScrollRef],
  )

  return (
    <div className={className ? `${styles.preview} ${className}` : styles.preview}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        skipHtml
        urlTransform={restrictMarkdownUrl}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
