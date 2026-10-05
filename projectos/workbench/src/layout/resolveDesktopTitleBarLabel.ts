import type { MapArtifact, MapContentDocument } from '@contracts/map-content'
import type { ProjectOSProject } from '@contracts/project'
import type { ProjectGraph } from '@contracts/graph'

export const DESKTOP_WINDOW_DEFAULT_TITLE = 'Project OS'

export function projectFolderName(project: ProjectOSProject): string {
  const normalized = project.workspaceRoot.replace(/\\/g, '/')
  const base = normalized.split('/').filter(Boolean).pop()
  if (!base || base === '.') return project.displayName
  return base
}

export function getArtifactTitle(artifact: MapArtifact, untitledLabel = 'Untitled'): string {
  switch (artifact.type) {
    case 'note':
      return artifact.note.title?.trim() || untitledLabel
    case 'plan':
      return artifact.plan.title?.trim() || untitledLabel
    case 'acceptance_list':
      return artifact.acceptance.title?.trim() || untitledLabel
    case 'terminal':
      return artifact.terminal.title?.trim() || untitledLabel
    case 'image':
      return artifact.image.title?.trim() || artifact.image.fileName
    case 'urls':
      return artifact.urls.title?.trim() || untitledLabel
  }
}

export function resolveDesktopTitleBarLabel(input: {
  project: ProjectOSProject | null
  graph: ProjectGraph | null
  mapContent: MapContentDocument | null
  selectedNodeId: string | null
  selectedArtifactId: string | null
  globalAgentActive?: boolean
  globalScopeLabel?: string
  untitledLabel?: string
}): string | null {
  const {
    project,
    graph,
    mapContent,
    selectedNodeId,
    selectedArtifactId,
    globalAgentActive,
    globalScopeLabel,
    untitledLabel,
  } = input
  if (!project) return null

  if (globalAgentActive && globalScopeLabel) return globalScopeLabel

  if (selectedArtifactId && mapContent) {
    const artifact = mapContent.artifacts.find((item) => item.id === selectedArtifactId)
    if (artifact) return getArtifactTitle(artifact, untitledLabel)
  }

  if (selectedNodeId && graph) {
    const node = graph.nodes.find((item) => item.id === selectedNodeId)
    if (node?.name) return node.name
  }

  return projectFolderName(project)
}
