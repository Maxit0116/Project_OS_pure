import { CheckSquare, FileText, Globe, ImageIcon, ListTodo, Terminal, type LucideIcon } from 'lucide-react'
import type { MapArtifactType } from '@contracts/index'

export interface MapCreateArtifactAction {
  type: MapArtifactType
  icon: LucideIcon
  labelKey: string
}

export const MAP_CREATE_ARTIFACT_ACTIONS: MapCreateArtifactAction[] = [
  { type: 'note', icon: FileText, labelKey: 'mapArtifacts.addNote' },
  { type: 'plan', icon: ListTodo, labelKey: 'mapArtifacts.addPlan' },
  { type: 'acceptance_list', icon: CheckSquare, labelKey: 'mapArtifacts.addAcceptance' },
  { type: 'terminal', icon: Terminal, labelKey: 'mapArtifacts.addTerminal' },
  { type: 'image', icon: ImageIcon, labelKey: 'mapArtifacts.addImage' },
  { type: 'urls', icon: Globe, labelKey: 'mapArtifacts.addUrls' },
]
