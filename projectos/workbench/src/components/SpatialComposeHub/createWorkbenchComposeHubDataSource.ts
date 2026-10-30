import type { ProjectOSApi, ProjectOSProject } from '@contracts/index'
import { useChatSessionStore } from '../../state/chatSessionStore'
import { useWorkbenchStore } from '../../state/workbenchStore'
import type { ComposeHubDataSource } from './hubActions'

export interface WorkbenchComposeHubDataSourceOptions {
  client: ProjectOSApi | null | undefined
  project: ProjectOSProject | null | undefined
  resolveAssetUrl?: (assetPath: string) => string | undefined
}

/**
 * Workbench-side ComposeHubDataSource shared by Spatial Captures and
 * Chat Composer Stage Dock (same IPC/API surface as Capture canvas).
 */
export function createWorkbenchComposeHubDataSource(
  options: WorkbenchComposeHubDataSourceOptions,
): ComposeHubDataSource {
  const { client, project, resolveAssetUrl } = options
  return {
    listSkills: async () => {
      if (!client || !project) return []
      const result = await client.listSkills(project.projectId)
      return result.skills.map((skill) => ({
        id: skill.id,
        name: skill.name,
        description: skill.description,
      }))
    },
    listDirectories: async (relativePath) => {
      if (!client || !project) return []
      const entries = await client.listWorkspaceDirectory(
        project.projectId,
        relativePath,
      )
      return entries
        .filter((entry) => entry.kind === 'directory')
        .map((entry) => ({ name: entry.name, path: entry.path }))
    },
    listMentionFiles: async (query) => {
      if (!client || !project) return []
      const result = await client.getComposerMentions(project.projectId, query)
      return result.files
    },
    pickReferenceFiles: async (options) => {
      if (!window.projectOS?.shell?.pickReferenceFiles) return []
      return window.projectOS.shell.pickReferenceFiles(options)
    },
    listMcpServers: async () => {
      if (!client || !project) return []
      const servers = (await client.listMcpServers(project.projectId)) ?? []
      return servers.map((server) => ({
        id: server.id,
        name: server.name,
        enabled: server.enabled,
        transport: server.transport,
        toolCount: server.toolAllowlist?.length,
      }))
    },
    setMcpServerEnabled: async (serverId, enabled) => {
      if (!client || !project) return null
      const servers = await client.listMcpServers(project.projectId)
      const current = servers.find((server) => server.id === serverId)
      if (!current) return null
      const nextConfig = { ...current, enabled }
      await client.saveMcpServer(project.projectId, { config: nextConfig })
      return {
        id: nextConfig.id,
        name: nextConfig.name,
        enabled: nextConfig.enabled,
        transport: nextConfig.transport,
        toolCount: nextConfig.toolAllowlist?.length,
      }
    },
    openMcpSettings: () => {
      useWorkbenchStore.getState().setSettingsOpen(true)
    },
    openMarketplace: () => {
      useChatSessionStore.getState().setMarketplaceOpen(true)
    },
    getGitStatus: async () => {
      if (!client || !project) return { branch: null, dirty: false }
      return client.getWorkspaceGitStatus(project.projectId)
    },
    listGitBranches: async () => {
      if (!client || !project) {
        return { defaultBranch: null, currentBranch: null, branches: [] }
      }
      return client.listWorkspaceGitBranches(project.projectId)
    },
    fetchGit: async () => {
      if (!client || !project) {
        return { ok: false, message: 'No project' }
      }
      return client.fetchWorkspaceGit(project.projectId)
    },
    openGithubGraph: () => {
      useChatSessionStore.getState().setGithubGraphOpen(true)
    },
    openExternalUrl: (url) => {
      void window.projectOS?.shell.openExternal(url)
    },
    getProjectGraph: async () => {
      if (!client || !project) return null
      const graph = await client.getProjectGraph(project.projectId)
      return {
        nodes: graph.nodes,
        edges: graph.edges,
      }
    },
    listRepoCandidates: async () =>
      project
        ? [
            {
              projectId: project.projectId,
              displayName: project.displayName || project.projectId,
            },
          ]
        : [],
    ...(resolveAssetUrl ? { resolveAssetUrl } : {}),
  }
}
