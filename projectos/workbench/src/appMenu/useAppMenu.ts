import { useEffect } from 'react'
import { parseAppMenuCommand } from '@contracts/app-menu'
import { hasOpenEditorFiles } from '../components/CodeEditor/editorPaneHelpers'
import { readRecentWorkspaces } from '../state/recentWorkspaces'
import { useWorkbenchStore } from '../state/workbenchStore'
import { commandFromKeyEvent, executeAppMenuCommand } from './menuCommands'

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
      })
    }
    publish()
    const retry = window.setTimeout(publish, 300)
    return () => window.clearTimeout(retry)
  }, [locale, phase, workspaceRoot, editorPanes])

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
