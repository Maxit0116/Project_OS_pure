export { default as AgentPoolPanel } from './AgentPoolPanel'
export { useAgentPoolStore, agentPoolOverlayFromStore } from './agentPoolStore'
export { syncComposeSubagentsToPool } from './syncComposeSubagents'
export {
  projectAgentPool,
  buildHistoryEntryFromTask,
  type AgentPoolTask,
  type AgentPoolHistoryEntry,
} from './projectAgentPool'
