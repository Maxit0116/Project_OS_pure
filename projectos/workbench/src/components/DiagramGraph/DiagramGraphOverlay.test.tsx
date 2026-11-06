import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { useChatSessionStore } from '../../state/chatSessionStore'
import DiagramGraphOverlay from './DiagramGraphOverlay'

describe('DiagramGraphOverlay', () => {
  it('renders nothing when closed', () => {
    useChatSessionStore.getState().setDiagramGraphOpen(false)
    expect(renderToStaticMarkup(<DiagramGraphOverlay />)).toBe('')
  })
})
