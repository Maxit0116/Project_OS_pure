import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '../../i18n'
import { useSpatialCaptureStore } from '../../state/spatialCaptureStore'
import { useWorkbenchStore } from '../../state/workbenchStore'
import CaptureFolderNameDialog, {
  type CaptureNamePromptState,
} from './CaptureFolderNameDialog'
import styles from './CaptureFolderDnD.module.css'
import {
  useCaptureFolderDrag,
  type CaptureDragSource,
  type CaptureDragState,
  type CaptureDropTarget,
} from './useCaptureFolderDrag'

interface CaptureFolderDnDValue {
  drag: CaptureDragState | null
  onPointerDown: (
    event: ReactPointerEvent,
    payload: {
      sessionId?: string | null
      folderId?: string | null
      title: string
      source: CaptureDragSource
    },
  ) => void
  onPointerMove: (event: ReactPointerEvent) => void
  onPointerUp: (event: ReactPointerEvent) => void
  consumeClickSuppression: () => boolean
  isDropActive: (kind: CaptureDropTarget['kind'], id?: string) => boolean
}

const CaptureFolderDnDContext = createContext<CaptureFolderDnDValue | null>(null)

export function useCaptureFolderDnD(): CaptureFolderDnDValue {
  const value = useContext(CaptureFolderDnDContext)
  if (!value) {
    return {
      drag: null,
      onPointerDown: () => undefined,
      onPointerMove: () => undefined,
      onPointerUp: () => undefined,
      consumeClickSuppression: () => false,
      isDropActive: () => false,
    }
  }
  return value
}

type PendingAction =
  | {
      type: 'merge_misc'
      sessionId: string
      otherSessionId: string
      fromTitle: string
      otherTitle: string
    }
  | {
      type: 'new_folder'
      sessionId: string
      title: string
    }
  | {
      type: 'merge_folders'
      sourceFolderId: string
      targetFolderId: string
      sourceName: string
      targetName: string
    }

interface ProviderProps {
  children: ReactNode
}

export function CaptureFolderDnDProvider({ children }: ProviderProps) {
  const { ts } = useI18n()
  const heads = useSpatialCaptureStore((s) => s.heads)
  const folders = useSpatialCaptureStore((s) => s.folders)
  const placeSession = useSpatialCaptureStore((s) => s.placeSession)
  const deleteFolder = useSpatialCaptureStore((s) => s.deleteFolder)
  const mergeFolders = useSpatialCaptureStore((s) => s.mergeFolders)
  const pushToast = useWorkbenchStore((s) => s.pushToast)

  const [pending, setPending] = useState<PendingAction | null>(null)
  const [prompt, setPrompt] = useState<CaptureNamePromptState | null>(null)

  const reportError = useCallback(
    (message: string | undefined) => {
      pushToast({
        type: 'error',
        message: message ?? ts('spatialCaptures.loadError'),
      })
    },
    [pushToast, ts],
  )

  const handleDrop = useCallback(
    (drag: CaptureDragState, target: CaptureDropTarget) => {
      // ——— Folder stack drag ———
      if (drag.source === 'folder' && drag.folderId) {
        // Misc panel (including hovering a Misc row) dissolves the folder.
        if (target.kind === 'misc' || target.kind === 'session') {
          void deleteFolder(drag.folderId, { cascade: false }).then((result) => {
            if (!result.ok) reportError(result.error)
          })
          return
        }
        if (target.kind === 'folder' && target.folderId) {
          if (target.folderId === drag.folderId) return
          const source = folders.find((folder) => folder.id === drag.folderId)
          const dest = folders.find((folder) => folder.id === target.folderId)
          if (!source || !dest) return
          setPending({
            type: 'merge_folders',
            sourceFolderId: source.id,
            targetFolderId: dest.id,
            sourceName: source.name,
            targetName: dest.name,
          })
          setPrompt({
            kind: 'merge_folders',
            defaultName: dest.name,
            sourceName: source.name,
            targetName: dest.name,
          })
          return
        }
        return
      }

      // ——— Session drag (misc / drill) ———
      const sessionId = drag.sessionId
      if (!sessionId) return

      if (drag.source === 'drill') {
        // MVP: only take out to Misc (Q2=C).
        if (target.kind === 'misc') {
          const head = heads.find((item) => item.id === sessionId)
          void placeSession(sessionId, {
            mode: 'misc',
            title: head?.title?.trim() || '',
          }).then((result) => {
            if (!result.ok) reportError(result.error)
          })
        }
        return
      }

      // misc session
      if (target.kind === 'folder' && target.folderId) {
        void placeSession(sessionId, {
          mode: 'join_folder',
          folderId: target.folderId,
          title: '',
        }).then((result) => {
          if (!result.ok) reportError(result.error)
        })
        return
      }

      if (target.kind === 'drill-folder' && target.folderId) {
        void placeSession(sessionId, {
          mode: 'join_folder',
          folderId: target.folderId,
          title: '',
        }).then((result) => {
          if (!result.ok) reportError(result.error)
        })
        return
      }

      if (target.kind === 'session' && target.sessionId) {
        if (target.sessionId === sessionId) return
        const from = heads.find((item) => item.id === sessionId)
        const other = heads.find((item) => item.id === target.sessionId)
        if (!from || !other) return

        // Latent singleton folder: join without naming.
        if (from.folderId) {
          void placeSession(other.id, {
            mode: 'join_folder',
            folderId: from.folderId,
            title: '',
          }).then((result) => {
            if (!result.ok) reportError(result.error)
          })
          return
        }
        if (other.folderId) {
          void placeSession(sessionId, {
            mode: 'join_folder',
            folderId: other.folderId,
            title: '',
          }).then((result) => {
            if (!result.ok) reportError(result.error)
          })
          return
        }

        const defaultName =
          from.title?.trim() || other.title?.trim() || ts('spatialCaptures.folderUntitled')
        setPending({
          type: 'merge_misc',
          sessionId,
          otherSessionId: other.id,
          fromTitle: from.title?.trim() || '',
          otherTitle: other.title?.trim() || '',
        })
        setPrompt({
          kind: 'merge_misc',
          defaultName,
          allowKeepTitles: true,
        })
        return
      }

      if (target.kind === 'workspace-empty') {
        const head = heads.find((item) => item.id === sessionId)
        const defaultName =
          head?.title?.trim() || ts('spatialCaptures.folderUntitled')
        setPending({
          type: 'new_folder',
          sessionId,
          title: head?.title?.trim() || '',
        })
        setPrompt({
          kind: 'new_folder',
          defaultName,
        })
      }
    },
    [
      deleteFolder,
      folders,
      heads,
      placeSession,
      reportError,
      ts,
    ],
  )

  const {
    drag,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    consumeClickSuppression,
  } = useCaptureFolderDrag({ onDrop: handleDrop })

  const confirmPrompt = useCallback(
    async (result: { name: string; keepTitles: boolean }) => {
      const action = pending
      setPrompt(null)
      setPending(null)
      if (!action) return

      if (action.type === 'merge_misc') {
        const placeResult = await placeSession(action.sessionId, {
          mode: 'merge_misc',
          otherSessionId: action.otherSessionId,
          folderName: result.name,
          title: result.keepTitles
            ? action.fromTitle || `${result.name}-2`
            : '',
          otherTitle: result.keepTitles
            ? action.otherTitle || `${result.name}-1`
            : `${result.name}-1`,
        })
        if (!placeResult.ok) reportError(placeResult.error)
        return
      }

      if (action.type === 'new_folder') {
        const placeResult = await placeSession(action.sessionId, {
          mode: 'new_folder',
          folderName: result.name,
          title: action.title || '',
        })
        if (!placeResult.ok) {
          reportError(placeResult.error)
          return
        }
        pushToast({
          type: 'info',
          message: ts('spatialCaptures.dragSingletonHint'),
        })
        return
      }

      if (action.type === 'merge_folders') {
        const mergeResult = await mergeFolders(
          action.sourceFolderId,
          action.targetFolderId,
          { name: result.name },
        )
        if (!mergeResult.ok) reportError(mergeResult.error)
      }
    },
    [mergeFolders, pending, placeSession, pushToast, reportError, ts],
  )

  const isDropActive = useCallback(
    (kind: CaptureDropTarget['kind'], id?: string) => {
      if (!drag?.target || drag.target.kind !== kind) return false
      if (kind === 'folder' || kind === 'drill-folder') {
        return Boolean(id && drag.target.folderId === id)
      }
      if (kind === 'session') {
        return Boolean(id && drag.target.sessionId === id)
      }
      return true
    },
    [drag],
  )

  const value = useMemo<CaptureFolderDnDValue>(
    () => ({
      drag,
      onPointerDown,
      onPointerMove,
      onPointerUp,
      consumeClickSuppression,
      isDropActive,
    }),
    [
      consumeClickSuppression,
      drag,
      isDropActive,
      onPointerDown,
      onPointerMove,
      onPointerUp,
    ],
  )

  return (
    <CaptureFolderDnDContext.Provider value={value}>
      {children}
      {drag
        ? createPortal(
            <div
              className={styles.ghost}
              style={{ left: drag.x + 12, top: drag.y + 12 }}
              aria-hidden
            >
              {drag.title}
            </div>,
            document.body,
          )
        : null}
      {prompt ? (
        <CaptureFolderNameDialog
          prompt={prompt}
          onCancel={() => {
            setPrompt(null)
            setPending(null)
          }}
          onConfirm={(result) => {
            void confirmPrompt(result)
          }}
        />
      ) : null}
    </CaptureFolderDnDContext.Provider>
  )
}
