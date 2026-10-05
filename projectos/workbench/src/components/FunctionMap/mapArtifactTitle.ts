import type { MapArtifact, UpdateMapArtifactPatch } from '@contracts/index'

export function getMapArtifactStoredTitle(artifact: MapArtifact): string | undefined {
  switch (artifact.type) {
    case 'note':
      return artifact.note.title?.trim() || undefined
    case 'plan':
      return artifact.plan.title?.trim() || undefined
    case 'acceptance_list':
      return artifact.acceptance.title?.trim() || undefined
    case 'terminal':
      return artifact.terminal.title?.trim() || undefined
    case 'image':
      return artifact.image.title?.trim() || undefined
    case 'urls':
      return artifact.urls.title?.trim() || undefined
  }
}

export function getMapArtifactDisplayTitle(
  artifact: MapArtifact,
  untitledLabel: string,
): string {
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

export function buildMapArtifactTitlePatch(
  artifact: MapArtifact,
  title: string | undefined,
): UpdateMapArtifactPatch {
  switch (artifact.type) {
    case 'note':
      return { note: { ...artifact.note, title } }
    case 'plan':
      return { plan: { ...artifact.plan, title } }
    case 'acceptance_list':
      return { acceptance: { ...artifact.acceptance, title } }
    case 'terminal':
      return { terminal: { ...artifact.terminal, title } }
    case 'image':
      return { image: { ...artifact.image, title } }
    case 'urls':
      return { urls: { ...artifact.urls, title } }
  }
}
