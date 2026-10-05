import { useEffect } from 'react'
import type { ProjectOSProject } from '@contracts/project'
import { isMacElectronShell } from '../data/clientMode'
import {
  DESKTOP_WINDOW_DEFAULT_TITLE,
  projectFolderName,
} from './resolveDesktopTitleBarLabel'

/** Sync project folder name to the native macOS fullscreen title bar (right of traffic lights). */
export function useSyncDesktopWindowTitle(
  project: ProjectOSProject | null,
  isFullScreen: boolean,
): void {
  useEffect(() => {
    if (!isMacElectronShell()) return

    const bridge = window.projectOS?.window
    if (!bridge?.setTitle) return

    const title = isFullScreen && project
      ? projectFolderName(project)
      : DESKTOP_WINDOW_DEFAULT_TITLE

    void bridge.setTitle(title)
  }, [project, isFullScreen, project?.workspaceRoot, project?.displayName])
}
