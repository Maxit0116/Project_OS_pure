import { useChatSessionStore } from '../../state/chatSessionStore'

const TAB_STORAGE_KEY = 'projectos.marketplace.activeTab'
const VIEW_STORAGE_KEY = 'projectos.marketplace.viewMode'

/** Open Capability Marketplace on the Agents (talent library) catalog tab. */
export function openMarketplaceTalentLibrary(): void {
  try {
    sessionStorage.setItem(TAB_STORAGE_KEY, 'agents')
    sessionStorage.setItem(VIEW_STORAGE_KEY, 'catalog')
  } catch {
    /* ignore */
  }
  const store = useChatSessionStore.getState()
  // Re-open so MarketplaceOverlay's open-effect re-reads tab/view from storage
  // even when the overlay was already showing another tab.
  if (store.marketplaceOpen) {
    store.setMarketplaceOpen(false)
    queueMicrotask(() => {
      useChatSessionStore.getState().setMarketplaceOpen(true)
    })
    return
  }
  store.setMarketplaceOpen(true)
}
