export { default as SpatialComposeHub, ResearchToggle, ensureHub } from './SpatialComposeHub'
export { COMPOSE_HUB_STRINGS_EN } from './composeHubStrings'
export type { ComposeHubStrings } from './composeHubStrings'
export type { ComposeHubDataSource } from './hubActions'
export { createWorkbenchComposeHubDataSource } from './createWorkbenchComposeHubDataSource'
export { default as ComposerRepoQuickOps } from './ComposerRepoQuickOps'
export {
  createWorkbenchComposerRepoOpsHost,
  createOverlayComposerRepoOpsHost,
  applyGithubCardHostBridgeEvent,
} from './composerRepoOpsHost'
export type {
  ComposerRepoOpsHost,
  GithubCardHostBridgeEvent,
} from './composerRepoOpsHost'
export { resolveRepoSyncButtons, remoteUrlToHttps } from './repoQuickOps'
export { useComposeHubStrings } from './useComposeHubStrings'
export {
  appendComposerHubToPrompt,
  COMPOSER_STAGE_SLOTS,
  stageSlotBadgeCount,
} from './composerHubPrompt'
export type { ComposerStageSlot } from './composerHubPrompt'
export { ensureHub as ensureComposeHub, useComposeHubController } from './useComposeHubController'
export {
  layoutSatellites,
  satelliteConnectorPath,
  SATELLITE_WIDTH,
  SATELLITE_HEIGHT,
  HUB_GAP,
} from './hubLayout'
