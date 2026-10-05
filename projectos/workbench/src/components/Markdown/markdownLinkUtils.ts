const ABSOLUTE_WEB_URL = /^(https?:\/\/|mailto:)/i

const IMAGE_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.svg',
])

export function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/<[^>]+>/g, '')
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
}

export function isAbsoluteWebUrl(url: string): boolean {
  return ABSOLUTE_WEB_URL.test(url)
}

export function isWorkspaceRelativePath(url: string): boolean {
  if (!url || url.startsWith('#') || isAbsoluteWebUrl(url)) return false
  if (url.startsWith('javascript:') || url.startsWith('data:')) return false
  return true
}

export function isImagePath(path: string): boolean {
  const lower = path.toLowerCase()
  for (const ext of IMAGE_EXTENSIONS) {
    if (lower.endsWith(ext)) return true
  }
  return false
}

export function resolveRelativeDocumentPath(documentPath: string, href: string): string | null {
  if (!isWorkspaceRelativePath(href)) return null

  const normalizedHref = href.replace(/\\/g, '/')
  const baseParts = documentPath.split('/').slice(0, -1)
  const hrefParts = normalizedHref.split('/')

  const resolved = [...baseParts]
  for (const part of hrefParts) {
    if (!part || part === '.') continue
    if (part === '..') {
      if (resolved.length === 0) return null
      resolved.pop()
      continue
    }
    resolved.push(part)
  }

  return resolved.join('/')
}

export function splitDocumentHref(href: string): { path: string; hash: string } {
  const hashIndex = href.indexOf('#')
  if (hashIndex === -1) return { path: href, hash: '' }
  return {
    path: href.slice(0, hashIndex),
    hash: href.slice(hashIndex + 1),
  }
}

export function findHeadingLine(content: string, slug: string): number | null {
  if (!slug) return null
  const lines = content.split('\n')
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^#{1,6}\s+(.+?)\s*$/)
    if (!match) continue
    if (slugifyHeading(match[1]) === slug) return index + 1
  }
  return null
}

export function restrictMarkdownUrl(url: string): string | undefined {
  if (url.startsWith('#')) return url
  if (isWorkspaceRelativePath(url)) return url
  try {
    const parsed = new URL(url)
    const allowed = new Set(['http:', 'https:', 'mailto:'])
    return allowed.has(parsed.protocol) ? url : undefined
  } catch {
    return undefined
  }
}
