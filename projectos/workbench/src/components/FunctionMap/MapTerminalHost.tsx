import { useEffect, useMemo, useRef } from 'react'
import { isDesktopApp } from '../../data/clientMode'
import { useI18n } from '../../i18n'
import { useActivityStore } from '../../state/activityStore'
import { useTerminalStore } from '../../state/terminalStore'
import { useTerminalView } from '../Terminal/useTerminalView'
import styles from './mapArtifactNodes.module.css'

interface Props {
  artifactId: string
  cwd?: string
  width: number
  height: number
  focused: boolean
}

export default function MapTerminalHost({
  artifactId,
  cwd,
  width,
  height,
  focused,
}: Props) {
  const { ts } = useI18n()
  const activityEntries = useActivityStore((s) => s.entries)
  const systemLines = useMemo(
    () =>
      activityEntries
        .filter((entry) => entry.channel === 'system')
        .map((entry) => entry.title),
    [activityEntries],
  )
  const tabId = useTerminalStore((s) => s.mapSessions[artifactId])
  const createMapSession = useTerminalStore((s) => s.createMapSession)
  const disposeMapSession = useTerminalStore((s) => s.disposeMapSession)
  const initIpcListeners = useTerminalStore((s) => s.initIpcListeners)
  const isNative = isDesktopApp()
  const pendingDisposalRef = useRef<{
    artifactId: string
    timer: ReturnType<typeof globalThis.setTimeout>
  } | null>(null)
  const sessionCreationsRef = useRef(new Map<string, Promise<void>>())

  useEffect(() => {
    initIpcListeners()
  }, [initIpcListeners])

  useEffect(() => {
    if (!tabId && !sessionCreationsRef.current.has(artifactId)) {
      const creation = createMapSession(artifactId, { cwd })
      sessionCreationsRef.current.set(artifactId, creation)
      const clearCreation = () => {
        if (sessionCreationsRef.current.get(artifactId) === creation) {
          sessionCreationsRef.current.delete(artifactId)
        }
      }
      void creation.then(clearCreation, clearCreation)
    }
  }, [artifactId, cwd, createMapSession, tabId])

  useEffect(() => {
    const pending = pendingDisposalRef.current
    if (pending?.artifactId === artifactId) {
      globalThis.clearTimeout(pending.timer)
      pendingDisposalRef.current = null
    }

    return () => {
      const ownedArtifactId = artifactId
      const timer = globalThis.setTimeout(() => {
        if (pendingDisposalRef.current?.timer === timer) {
          pendingDisposalRef.current = null
        }
        const creation = sessionCreationsRef.current.get(ownedArtifactId)
        void (creation ?? Promise.resolve()).then(
          () => disposeMapSession(ownedArtifactId),
          () => disposeMapSession(ownedArtifactId),
        )
      }, 0)
      pendingDisposalRef.current = { artifactId: ownedArtifactId, timer }
    }
  }, [artifactId, disposeMapSession])

  const { containerRef, refit, isNative: hookNative } = useTerminalView({
    tabId: tabId ?? '',
    mounted: isNative && !!tabId,
    focused,
  })

  useEffect(() => {
    if (hookNative && tabId) {
      refit()
    }
  }, [width, height, hookNative, refit, tabId])

  if (!isNative) {
    return (
      <pre className={`${styles.terminalMock} nodrag nopan`}>
        <span className={styles.terminalMockHint}>{ts('mapArtifacts.terminalMockHint')}</span>
        {systemLines.length === 0 ? ts('terminal.empty') : systemLines.join('\n')}
      </pre>
    )
  }

  if (!tabId) {
    return (
      <div className={`${styles.terminalHost} nodrag nopan`} aria-busy="true" />
    )
  }

  return <div ref={containerRef} className={`${styles.terminalHost} nodrag nopan`} />
}
