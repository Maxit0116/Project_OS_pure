import { useEffect, useMemo, useState } from 'react'
import type { ChatSessionHead, PromptAttachment, SkillDescriptor } from '@contracts/index'
import { useI18n } from '../../../i18n'
import { useWorkbenchStore } from '../../../state/workbenchStore'
import { getTabOutputBuffer } from '../../../state/terminalStore'
import { useTerminalStore } from '../../../state/terminalStore'
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
  const [skills, setSkills] = useState<SkillDescriptor[]>([])
  const [chatHeads, setChatHeads] = useState<ChatSessionHead[]>([])

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

    const filePaths = new Set<string>()
    for (const node of graph?.nodes ?? []) {
      for (const file of node.linkedFiles ?? []) {
        if (file.path) filePaths.add(file.path)
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
  }, [chatHeads, graph?.nodes, query, selectedFilePath, triggerKind, ts, tree])

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
      .map((skill) => ({
        id: `skill:${skill.id}`,
        label: `/${skill.name}`,
        description: skill.description,
        group: ts('composer.groups.skills'),
      }))

    return [...modeItems, ...skillMenu]
  }, [query, skills, triggerKind, ts])

  return triggerKind === '/' ? skillItems : contextItems
}

export function attachmentFromMenuItem(item: ComposerMenuItem): {
  attachment?: PromptAttachment
  invokedSkillId?: string
  mode?: 'ask' | 'plan' | 'change' | 'debug'
} {
  if (item.id.startsWith('mode:')) {
    return { mode: item.id.replace('mode:', '') as 'ask' | 'plan' | 'change' | 'debug' }
  }
  if (item.id.startsWith('skill:')) {
    const skillId = item.id.replace('skill:', '')
    return { invokedSkillId: skillId }
  }
  if (item.id.startsWith('file:')) {
    const path = item.id.replace('file:', '')
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
