import { basename } from 'node:path'
import { BrowserWindow } from 'electron'
import {
  buildScreenLocationKey,
  type LocationKey,
  type SpatialPinProjectCandidate,
  type SpatialPinSessionContext,
} from '../../../contracts/spatial-pin.js'
import { getProjectOsService } from './projectOsService.js'
import { workspacePathForWindow } from './workspaceWindowRegistry.js'
import { ptyManager } from './terminal/ptyManager.js'

function displayNameForPath(workspacePath: string, fallbackId: string): string {
  const name = basename(workspacePath.replace(/[/\\]+$/, ''))
  return name || fallbackId
}

function addCandidate(
  list: SpatialPinProjectCandidate[],
  candidate: SpatialPinProjectCandidate,
): void {
  if (list.some((item) => item.projectId === candidate.projectId)) return
  list.push(candidate)
}

/**
 * Primary Spatial Pin context: open Project OS workspaces + terminal CWDs.
 * Chrome/browser location is an optional enhancer layered on top.
 */
export function buildSpatialPinSessionContext(opts?: {
  preferredProjectId?: string | null
  webLocation?: Partial<LocationKey> | null
  chromeBridgeConnected?: boolean
  /** Last macOS host probe / capture enrichment (optional). */
  hostLocation?: Partial<LocationKey> | null
}): SpatialPinSessionContext {
  const projectOs = getProjectOsService()
  const loaded = projectOs.listLoadedProjects()
  const candidates: SpatialPinProjectCandidate[] = []

  const focused = BrowserWindow.getFocusedWindow()
  if (focused && !focused.isDestroyed()) {
    const path = workspacePathForWindow(focused.webContents.id)
    if (path) {
      const project = projectOs.findLoadedProjectByWorkspaceRoot(path)
      if (project) {
        addCandidate(candidates, {
          projectId: project.projectId,
          workspacePath: project.workspaceRoot,
          displayName: displayNameForPath(
            project.workspaceRoot,
            project.displayName || project.projectId,
          ),
          source: 'focused-window',
        })
      }
    }
  }

  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue
    const path = workspacePathForWindow(win.webContents.id)
    if (!path) continue
    const project = projectOs.findLoadedProjectByWorkspaceRoot(path)
    if (!project) continue
    addCandidate(candidates, {
      projectId: project.projectId,
      workspacePath: project.workspaceRoot,
      displayName: displayNameForPath(
        project.workspaceRoot,
        project.displayName || project.projectId,
      ),
      source: 'open-window',
    })
  }

  for (const session of ptyManager.listSessions()) {
    const project =
      projectOs.findLoadedProjectByWorkspaceRoot(session.cwd) ??
      loaded.find((item) => session.cwd.startsWith(item.workspaceRoot))
    if (!project) continue
    addCandidate(candidates, {
      projectId: project.projectId,
      workspacePath: project.workspaceRoot,
      displayName: displayNameForPath(
        project.workspaceRoot,
        project.displayName || project.projectId,
      ),
      source: 'terminal-cwd',
    })
  }

  for (const project of loaded) {
    addCandidate(candidates, {
      projectId: project.projectId,
      workspacePath: project.workspaceRoot,
      displayName: displayNameForPath(
        project.workspaceRoot,
        project.displayName || project.projectId,
      ),
      source: 'loaded',
    })
  }

  const preferred = opts?.preferredProjectId
    ? candidates.find((item) => item.projectId === opts.preferredProjectId)
    : undefined
  const selected = preferred ?? candidates[0] ?? null

  const terminalCwd =
    ptyManager
      .listSessions()
      .find((session) =>
        selected
          ? session.cwd === selected.workspacePath ||
            session.cwd.startsWith(selected.workspacePath)
          : false,
      )?.cwd ?? null

  const web = opts?.webLocation
  const webEnhanceAvailable =
    Boolean(
      (web?.surface === 'chrome' || web?.surface === 'projectos-browser') &&
        web.url &&
        web.url.startsWith('http'),
    ) || Boolean(opts?.chromeBridgeConnected)

  const host = opts?.hostLocation
  let location: LocationKey
  if (
    webEnhanceAvailable &&
    web?.url &&
    (web.surface === 'chrome' || web.surface === 'projectos-browser')
  ) {
    location = {
      surface: web.surface,
      url: web.url,
      routePath: web.routePath,
      selector: web.selector,
      axName: web.axName,
      textHint: web.textHint ?? host?.textHint,
      visualHash: web.visualHash,
      workspacePath: selected?.workspacePath,
      nodeId: web.nodeId,
      ...(host?.appName ? { appName: host.appName } : {}),
      ...(host?.bundleId ? { bundleId: host.bundleId } : {}),
      ...(host?.windowTitle ? { windowTitle: host.windowTitle } : {}),
      ...(host?.deviceKind ? { deviceKind: host.deviceKind } : {}),
      ...(host?.inferredPath ? { inferredPath: host.inferredPath } : {}),
    }
  } else {
    location = buildScreenLocationKey({
      workspacePath: selected?.workspacePath,
      terminalCwd,
      textHint: host?.textHint,
      appName: host?.appName,
      bundleId: host?.bundleId,
      windowTitle: host?.windowTitle,
      deviceKind: host?.deviceKind,
      inferredPath: host?.inferredPath,
    })
  }

  return {
    projectId: selected?.projectId ?? null,
    workspacePath: selected?.workspacePath ?? null,
    candidates,
    location,
    webEnhanceAvailable,
  }
}
