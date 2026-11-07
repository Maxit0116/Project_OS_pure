import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { useDiagramGraphStore } from '../../state/diagramGraphStore'
import DiagramNotebookRail from './DiagramNotebookRail'

describe('DiagramNotebookRail', () => {
  it('renders disabled when no diagram is present', () => {
    useDiagramGraphStore.getState().clear()
    const html = renderToStaticMarkup(<DiagramNotebookRail />)
    expect(html).toContain('data-diagram-notebook-rail')
    expect(html).toContain('data-enabled="false"')
  })
})
