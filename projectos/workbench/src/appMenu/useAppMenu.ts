import { useEffect } from 'react'
import { parseAppMenuCommand } from '@contracts/app-menu'
import { hasOpenEditorFiles } from '../components/CodeEditor/editorPaneHelpers'
import { readRecentWorkspaces } from '../state/recentWorkspaces'
import { useWorkbenchStore } from '../state/workbenchStore'
import { commandFromKeyEvent, executeAppMenuCommand } from './menuCommands'

let claimedInitialWorkspace = false

export function useAppMenu(): void {
  const locale = useWorkbenchStore((s) => s.locale)
  const phase = useWorkbenchStore((s) => s.phase)
  const workspaceRoot = useWorkbenchStore((s) => s.project?.workspaceRoot)
  const editorPanes = useWorkbenchStore((s) => s.editorPanes)

  useEffect(() => {
    const bridge = window.projectOS?.menu
    if (!bridge) return
    const publish = () => {
      bridge.setState({
        locale,
        recentWorkspaces: readRecentWorkspaces().map((item) => ({
          name: item.name,
          path: item.path,
        })),
        workspaceOpen: phase === 'ready',
        hasActiveEditor: hasOpenEditorFiles(editorPanes),
        workspacePath: phase === 'ready' && workspaceRoot ? workspaceRoot : null,
      })
    }
    publish()
    const retry = window.setTimeout(publish, 300)
    return () => window.clearTimeout(retry)
  }, [locale, phase, workspaceRoot, editorPanes])

  useEffect(() => {
    const readInitialWorkspace = window.projectOS?.window.initialWorkspace
    if (!readInitialWorkspace || claimedInitialWorkspace) return undefined
    let cancelled = false
    const openInitialWorkspace = (path: string | null) => {
      if (cancelled || !path || claimedInitialWorkspace) return
      claimedInitialWorkspace = true
      void useWorkbenchStore.getState().openWorkspace(path)
    }
    void readInitialWorkspace().then(openInitialWorkspace).catch(() => {
      window.setTimeout(() => {
        if (cancelled || claimedInitialWorkspace) return
        void readInitialWorkspace().then(openInitialWorkspace)
      }, 250)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const bridge = window.projectOS?.menu
    if (!bridge) return undefined
    return bridge.onCommand((command) => {
      const parsed = parseAppMenuCommand(command)
      if (parsed) executeAppMenuCommand(parsed)
    }).dispose
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const command = commandFromKeyEvent(event)
      if (!command) return
      event.preventDefault()
      if (command.id !== 'command-palette') event.stopPropagation()
      executeAppMenuCommand(command)
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [])
}
