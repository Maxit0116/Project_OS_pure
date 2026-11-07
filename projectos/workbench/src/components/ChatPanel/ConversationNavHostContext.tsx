import { createContext, useContext } from 'react'

/** Portal mount point on the AI Chat sidebar’s left exterior (RightPanel). */
export const ConversationNavHostContext = createContext<HTMLElement | null>(null)

export function useConversationNavHost(): HTMLElement | null {
  return useContext(ConversationNavHostContext)
}
