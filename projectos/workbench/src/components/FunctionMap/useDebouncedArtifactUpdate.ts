import { useCallback, useEffect, useRef } from 'react'
import type { UpdateMapArtifactPatch } from '@contracts/index'
import { useWorkbenchStore } from '../../state/workbenchStore'

export function useDebouncedArtifactUpdate(artifactId: string) {
  const updateMapArtifact = useWorkbenchStore((s) => s.updateMapArtifact)
  const timerRef = useRef<number | null>(null)
  const pendingRef = useRef<{
    artifactId: string
    patch: UpdateMapArtifactPatch
  } | null>(null)
  const updateMapArtifactRef = useRef(updateMapArtifact)
  updateMapArtifactRef.current = updateMapArtifact

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const flushPending = useCallback(() => {
    clearTimer()
    const pending = pendingRef.current
    pendingRef.current = null
    if (pending) {
      void updateMapArtifactRef.current(pending.artifactId, pending.patch)
    }
  }, [clearTimer])

  const flush = useCallback(
    (patch: UpdateMapArtifactPatch) => {
      clearTimer()
      pendingRef.current = null
      void updateMapArtifactRef.current(artifactId, patch)
    },
    [artifactId, clearTimer],
  )

  const schedule = useCallback(
    (patch: UpdateMapArtifactPatch) => {
      clearTimer()
      pendingRef.current = { artifactId, patch }
      timerRef.current = window.setTimeout(() => {
        flushPending()
      }, 300)
    },
    [artifactId, clearTimer, flushPending],
  )

  useEffect(
    () => () => {
      flushPending()
    },
    [artifactId, flushPending],
  )

  return { schedule, flush }
}

export function newCriterionId() {
  return `ac_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
}
