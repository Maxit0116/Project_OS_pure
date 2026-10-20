import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { ChatSessionHead, PromptAttachment, SkillDescriptor } from '@contracts/index'
import { useI18n } from '../../../i18n'
import { useWorkbenchStore } from '../../../state/workbenchStore'
import { getTabOutputBuffer } from '../../../state/terminalStore'
import { useTerminalStore } from '../../../state/terminalStore'
import { getEditorSelection, subscribeEditorSelection } from '../../CodeEditor/editorSelection'
import type { ComposerMenuItem } from './ComposerTriggerMenu'
import { createAttachmentId } from './composerTokens'

interface UseComposerContextItemsOptions {
  triggerKind: '@' | '/' | null
  query: string
}

export function useComposerContextItems({
  triggerKind,
  query,
}: UseComposerContextItemsOptions) {
  const { ts } = useI18n()
  const project = useWorkbenchStore((s) => s.project)
  const graph = useWorkbenchStore((s) => s.graph)
  const tree = useWorkbenchStore((s) => s.tree)
  const client = useWorkbenchStore((s) => s.client)
  const selectedFilePath = useWorkbenchStore((s) => s.selectedFilePath)
  const editorPanes = useWorkbenchStore((s) => s.editorPanes)
  const selection = useSyncExternalStore(subscribeEditorSelection, getEditorSelection, () => null)
  const [skills, setSkills] = useState<SkillDescriptor[]>([])
  const [chatHeads, setChatHeads] = useState<ChatSessionHead[]>([])
  const [mentions, setMentions] = useState<{
    files: string[]
    rules: Array<{ path: string; description: string }>
  }>({ files: [], rules: [] })

  useEffect(() => {
    if (!project || triggerKind !== '/') return
    void client.listSkills(project.projectId).then((result) => {
      setSkills(result.skills)
    })
  }, [client, project, triggerKind])

  useEffect(() => {
    if (!project || triggerKind !== '@') return
    void client.listChatSessionHeads(project.projectId).then(setChatHeads)
  }, [client, project, triggerKind])

  useEffect(() => {
    if (!project || triggerKind !== '@') return
    let cancelled = false
    void client.getComposerMentions(project.projectId, query.trim()).then((result) => {
      if (!cancelled) setMentions(result)
    })
    return () => {
      cancelled = true
    }
  }, [client, project, query, triggerKind])

  const contextItems = useMemo((): ComposerMenuItem[] => {
    if (triggerKind !== '@') return []
    const q = query.trim().toLowerCase()
    const match = (label: string) => !q || label.toLowerCase().includes(q)
    const items: ComposerMenuItem[] = []

    if (selectedFilePath && match(selectedFilePath)) {
      items.push({
        id: `file:${selectedFilePath}`,
        label: selectedFilePath.split('/').pop() ?? selectedFilePath,
        description: selectedFilePath,
        group: ts('composer.groups.files'),
      })
    }

    const queried = query.trim().length > 0
    const filePaths = new Set<string>()
    if (queried) {
      for (const path of mentions.files) filePaths.add(path)
    } else {
      for (const node of graph?.nodes ?? []) {
        for (const file of node.linkedFiles ?? []) {
          if (file.path) filePaths.add(file.path)
        }
      }
    }
    for (const path of [...filePaths].sort()) {
      if (path === selectedFilePath || !match(path)) continue
      items.push({
        id: `file:${path}`,
        label: path.split('/').pop() ?? path,
        description: path,
        group: ts('composer.groups.files'),
      })
    }

    for (const path of folderPaths(tree)) {
      if (!match(path)) continue
      items.push({
        id: `folder:${path}`,
        label: path.split('/').pop() ?? path,
        description: path,
        group: ts('composer.groups.folders'),
      })
    }

    for (const path of openEditorPaths(editorPanes)) {
      if (!match(path)) continue
      items.push({
        id: `editor:${path}`,
        label: path.split('/').pop() ?? path,
        description: ts('composer.openEditor'),
        group: ts('composer.groups.editors'),
      })
    }

    if (selection && match(selection.path)) {
      items.push({
        id: `selection:${selection.path}:${selection.startLine}-${selection.endLine}`,
        label: ts('composer.currentSelection'),
        description: `${selection.path}:${selection.startLine}-${selection.endLine}`,
        group: ts('composer.groups.selection'),
      })
    }

    for (const rule of mentions.rules) {
      if (!match(`${rule.path} ${rule.description}`)) continue
      items.push({
        id: `rule:${rule.path}`,
        label: rule.path,
        description: rule.description || ts('composer.rule'),
        group: ts('composer.groups.rules'),
      })
    }

    for (const node of graph?.nodes ?? []) {
      if (!match(node.name)) continue
      items.push({
        id: `node:${node.id}`,
        label: node.name,
        description: ts('composer.nodeDescription'),
        group: ts('composer.groups.nodes'),
      })
    }

    for (const head of chatHeads) {
      if (!match(head.title)) continue
      items.push({
        id: `chat:${head.id}`,
        label: head.title || ts('composer.untitledChat'),
        description: ts('composer.groups.chats'),
        group: ts('composer.groups.chats'),
      })
    }

    if (match(ts('composer.activeTerminal'))) {
      items.push({
        id: 'terminal:active',
        label: ts('composer.activeTerminal'),
        description: ts('composer.groups.terminals'),
        group: ts('composer.groups.terminals'),
      })
    }

    if (match('git') || match(ts('composer.gitWorking'))) {
      items.push({
        id: 'git:working',
        label: ts('composer.gitWorking'),
        group: ts('composer.groups.git'),
      })
      items.push({
        id: 'git:branch',
        label: ts('composer.gitBranch'),
        group: ts('composer.groups.git'),
      })
    }

    return items.slice(0, 40)
  }, [chatHeads, editorPanes, graph?.nodes, mentions, query, selectedFilePath, selection, triggerKind, ts, tree])

  const skillItems = useMemo((): ComposerMenuItem[] => {
    if (triggerKind !== '/') return []
    const q = query.trim().toLowerCase()
    const modeItems: ComposerMenuItem[] = [
      { id: 'mode:ask', label: '/ask', description: ts('composer.modeAsk'), group: ts('composer.groups.modes') },
      { id: 'mode:plan', label: '/plan', description: ts('composer.modePlan'), group: ts('composer.groups.modes') },
      { id: 'mode:change', label: '/change', description: ts('composer.modeChange'), group: ts('composer.groups.modes') },
      { id: 'mode:debug', label: '/debug', description: ts('composer.modeDebug'), group: ts('composer.groups.modes') },
    ].filter((item) => !q || item.label.includes(q) || item.description?.toLowerCase().includes(q))

    const skillMenu = skills
      .filter((skill) => {
        const haystack = `${skill.name} ${skill.description}`.toLowerCase()
        return !q || haystack.includes(q)
      })
      .flatMap((skill) => {
        const items: ComposerMenuItem[] = [
          {
            id: `skill:${skill.id}`,
            label: `/${skill.name}`,
            description: skill.description,
            group: ts('composer.groups.skills'),
          },
        ]
        if (skill.usableAsMode) {
          items.push({
            id: `skill-mode:${skill.id}`,
            label: `/${skill.name} · ${ts('chat.useAsMode')}`,
            description: skill.description,
            group: ts('composer.groups.skills'),
          })
        }
        return items
      })

    return [...modeItems, ...skillMenu]
  }, [query, skills, triggerKind, ts])

  return triggerKind === '/' ? skillItems : contextItems
}

export function attachmentFromMenuItem(item: ComposerMenuItem): {
  attachment?: PromptAttachment
  invokedSkillId?: string
  customModeSkillId?: string
  mode?: 'ask' | 'plan' | 'change' | 'debug'
} {
  if (item.id.startsWith('mode:')) {
    return { mode: item.id.replace('mode:', '') as 'ask' | 'plan' | 'change' | 'debug' }
  }
  if (item.id.startsWith('skill-mode:')) {
    return { customModeSkillId: item.id.replace('skill-mode:', '') }
  }
  if (item.id.startsWith('skill:')) {
    const skillId = item.id.replace('skill:', '')
    return { invokedSkillId: skillId }
  }
  if (item.id.startsWith('folder:')) {
    const path = item.id.slice('folder:'.length)
    return {
      attachment: {
        id: createAttachmentId(),
        label: item.label,
        ref: { kind: 'folder', path },
      },
    }
  }
  if (item.id.startsWith('rule:')) {
    const path = item.id.slice('rule:'.length)
    return {
      attachment: {
        id: createAttachmentId(),
        label: item.label,
        ref: { kind: 'rule', path },
      },
    }
  }
  if (item.id.startsWith('selection:')) {
    const pin = getEditorSelection()
    if (!pin) return {}
    return {
      attachment: {
        id: createAttachmentId(),
        label: item.label,
        ref: {
          kind: 'selection',
          path: pin.path,
          startLine: pin.startLine,
          endLine: pin.endLine,
          contentHash: pin.contentHash,
          sliceHash: pin.sliceHash,
          text: pin.text,
        },
      },
    }
  }
  if (item.id.startsWith('editor:') || item.id.startsWith('file:')) {
    const path = item.id.startsWith('editor:')
      ? item.id.slice('editor:'.length)
      : item.id.slice('file:'.length)
    return {
      attachment: {
        id: createAttachmentId(),
        label: item.label,
        ref: { kind: 'file', path },
      },
    }
  }
  if (item.id.startsWith('node:')) {
    return {
      attachment: {
        id: createAttachmentId(),
        label: item.label,
        ref: { kind: 'node', nodeId: item.id.replace('node:', '') },
      },
    }
  }
  if (item.id.startsWith('chat:')) {
    return {
      attachment: {
        id: createAttachmentId(),
        label: item.label,
        ref: { kind: 'chat', sessionId: item.id.replace('chat:', '') },
      },
    }
  }
  if (item.id === 'git:working') {
    return {
      attachment: {
        id: createAttachmentId(),
        label: item.label,
        ref: { kind: 'git_working' },
      },
    }
  }
  if (item.id === 'git:branch') {
    return {
      attachment: {
        id: createAttachmentId(),
        label: item.label,
        ref: { kind: 'git_branch' },
      },
    }
  }
  if (item.id === 'terminal:active') {
    const terminalState = useTerminalStore.getState()
    const pane = terminalState.panes.find((entry) => entry.id === terminalState.focusedPaneId)
    const tabId = pane?.activeTabId
    const output = tabId ? getTabOutputBuffer(tabId) : ''
    return {
      attachment: {
        id: createAttachmentId(),
        label: item.label,
        ref: { kind: 'terminal', tabId: tabId ?? 'unknown' },
        ...(output
          ? {
              resolved: {
                ref: { kind: 'terminal', tabId: tabId ?? 'unknown' },
                label: item.label,
                source: 'mention' as const,
                disposition: 'exact' as const,
                byteLength: output.length,
                includedByteLength: output.length,
                markdown: `# Terminal\n\n\`\`\`\n${output}\n\`\`\``,
              },
            }
          : {}),
      },
    }
  }
  return {}
}

interface FolderNode {
  kind: string
  path?: string
  children?: FolderNode[]
}

function folderPaths(tree: { roots?: FolderNode[] } | null): string[] {
  const out: string[] = []
  const walk = (nodes: readonly FolderNode[] | undefined) => {
    for (const node of nodes ?? []) {
      if (node.kind === 'folder' && node.path) out.push(node.path)
      walk(node.children)
    }
  }
  walk(tree?.roots)
  return out
}

function openEditorPaths(panes: ReadonlyArray<{ filePaths: readonly string[] }>): string[] {
  return [...new Set(panes.flatMap((pane) => pane.filePaths))]
}
