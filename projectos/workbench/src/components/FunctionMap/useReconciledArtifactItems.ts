import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'

const MAX_LOCAL_ITEM_VERSIONS = 32

function itemSignature(items: readonly unknown[]): string {
  return JSON.stringify(items)
}

/**
 * Keeps an editable local draft while distinguishing authoritative external
 * revisions from referentially-new persistence echoes of that same draft.
 */
export function useReconciledArtifactItems<T>(
  artifactId: string,
  authoritativeRevision: string,
  incomingItems: readonly T[],
): [T[], Dispatch<SetStateAction<T[]>>] {
  const [items, setItems] = useState<T[]>(() => [...incomingItems])
  const incomingRef = useRef({ artifactId, incomingItems })
  const artifactIdRef = useRef(artifactId)
  const lastIncomingSignatureRef = useRef(itemSignature(incomingItems))
  const localSignaturesRef = useRef<string[]>([])

  incomingRef.current = { artifactId, incomingItems }

  const setLocalItems = useCallback<Dispatch<SetStateAction<T[]>>>((nextValue) => {
    setItems((current) => {
      const next =
        typeof nextValue === 'function'
          ? (nextValue as (previous: T[]) => T[])(current)
          : nextValue
      const signature = itemSignature(next)
      const versions = localSignaturesRef.current
      if (!versions.includes(signature)) {
        versions.push(signature)
        if (versions.length > MAX_LOCAL_ITEM_VERSIONS) {
          versions.splice(0, versions.length - MAX_LOCAL_ITEM_VERSIONS)
        }
      }
      return next
    })
  }, [])

  useEffect(() => {
    const incoming = incomingRef.current
    const nextItems = [...incoming.incomingItems]
    const nextSignature = itemSignature(nextItems)

    if (artifactIdRef.current !== incoming.artifactId) {
      artifactIdRef.current = incoming.artifactId
      lastIncomingSignatureRef.current = nextSignature
      localSignaturesRef.current = []
      setItems(nextItems)
      return
    }

    const localIndex = localSignaturesRef.current.indexOf(nextSignature)
    if (localIndex >= 0) {
      localSignaturesRef.current.splice(localIndex, 1)
    }

    if (lastIncomingSignatureRef.current === nextSignature) {
      return
    }
    lastIncomingSignatureRef.current = nextSignature

    // A server echo of a locally produced value acknowledges that version but
    // must not replace the live input node (which would reset its caret).
    if (localIndex >= 0) {
      return
    }

    // A semantically different authoritative revision is an external update.
    // Adopt it so the next local edit is based on current state, not a stale copy.
    localSignaturesRef.current = []
    setItems((current) =>
      itemSignature(current) === nextSignature ? current : nextItems,
    )
  }, [artifactId, authoritativeRevision])

  return [items, setLocalItems]
}
