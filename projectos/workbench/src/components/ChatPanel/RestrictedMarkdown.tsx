import MarkdownPreview from '../Markdown/MarkdownPreview'

export { restrictMarkdownUrl } from '../Markdown/markdownLinkUtils'

export default function RestrictedMarkdown({ children }: { children: string }) {
  return <MarkdownPreview content={children} />
}
