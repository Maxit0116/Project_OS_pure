export interface NodeCopySource {
  summary?: string | null
  description?: string | null
  responsibility?: string | null
}

function trimCopy(value: string | null | undefined): string | undefined {
  const text = value?.trim()
  return text ? text : undefined
}

interface LinkedFileSource {
  linkedFiles?: ReadonlyArray<{ path: string; role?: string }> | null
}

const FILE_ROLE_ORDER: Record<string, number> = { primary: 0, supporting: 1, config: 2, test: 3 }

/**
 * The file names under a feature, the ones that carry its logic first and tests last, each name once.
 * A vibe coder looks for "which files is this?", not for folders.
 */
export function nodeFileNames(node: LinkedFileSource, limit = 24): string[] {
  const files = [...(node.linkedFiles ?? [])]
    .map((file, index) => ({ file, index }))
    .sort(
      (left, right) =>
        (FILE_ROLE_ORDER[left.file.role ?? 'supporting'] ?? 1) - (FILE_ROLE_ORDER[right.file.role ?? 'supporting'] ?? 1) ||
        left.index - right.index,
    )
  const names: string[] = []
  for (const { file } of files) {
    const name = file.path.split('/').filter(Boolean).at(-1)
    if (name && !names.includes(name)) names.push(name)
    if (names.length >= limit) break
  }
  return names
}

/** One line on the node. Prefer the short summary. */
export function nodeCardBlurb(node: NodeCopySource): string | undefined {
  return trimCopy(node.summary) ?? trimCopy(node.responsibility) ?? trimCopy(node.description)
}

/**
 * Hover-preview body. Uses the longer description when it adds something
 * the card line does not already say.
 */
export function nodePreviewBody(node: NodeCopySource): string | undefined {
  const card = nodeCardBlurb(node)
  const description = trimCopy(node.description)
  if (description && description !== card) return description
  const responsibility = trimCopy(node.responsibility)
  if (responsibility && responsibility !== card) return responsibility
  return undefined
}

/** Detail drawer: richer description, then ownership when it is a different sentence. */
export function nodeDetailCopy(node: NodeCopySource): {
  description?: string
  responsibility?: string
} {
  const description =
    trimCopy(node.description) ?? trimCopy(node.summary) ?? trimCopy(node.responsibility)
  const responsibility = trimCopy(node.responsibility)
  return {
    description,
    responsibility:
      responsibility && responsibility !== description ? responsibility : undefined,
  }
}
