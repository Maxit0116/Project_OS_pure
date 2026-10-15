export interface NodeCopySource {
  summary?: string | null
  description?: string | null
  responsibility?: string | null
}

function trimCopy(value: string | null | undefined): string | undefined {
  const text = value?.trim()
  return text ? text : undefined
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
