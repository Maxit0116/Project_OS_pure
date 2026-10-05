import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useWorkbenchStore } from '../../state/workbenchStore'
import FunctionMapContextMenu, {
  isNodeAgentMenuTarget,
} from './FunctionMapContextMenu'

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react')
  return { ...actual, useLayoutEffect: actual.useEffect }
})

vi.mock('react-dom', async () => {
  const actual = await vi.importActual<typeof import('react-dom')>('react-dom')
  return {
    ...actual,
    createPortal: (children: ReactNode) => children,
  }
})

beforeEach(() => {
  vi.stubGlobal('document', { body: {} })
})

afterEach(() => {
  useWorkbenchStore.setState({ locale: 'zh' })
  vi.unstubAllGlobals()
})

describe('FunctionMapContextMenu node agent action', () => {
  it.each(['context', 'container', 'component'] as const)(
    'allows the node agent action for %s nodes',
    (level) => {
      expect(isNodeAgentMenuTarget(level)).toBe(true)
    },
  )

  it('excludes synthetic file/code nodes', () => {
    expect(isNodeAgentMenuTarget('code')).toBe(false)

    const html = renderMenu('code')
    expect(html).not.toContain('打开此节点的 Agent 对话')
    expect(html).not.toContain('data-primary-menu-action="node-agent"')
    expect(html).toContain('打开文件')
    expect(html).toContain('打开文件 Agent')
  })

  it('puts the primary node-agent action first, followed by a separator', () => {
    const html = renderMenu('component')
    const primaryIndex = html.indexOf('打开此节点的 Agent 对话')
    const separatorIndex = html.indexOf('role="separator"')
    const createIndex = html.indexOf('新建 · 登录功能')

    expect(primaryIndex).toBeGreaterThan(-1)
    expect(primaryIndex).toBeLessThan(separatorIndex)
    expect(separatorIndex).toBeLessThan(createIndex)
  })

  it('puts open-file first, then file-agent, then a separator for code nodes', () => {
    const html = renderMenu('code')
    const primaryIndex = html.indexOf('打开文件')
    const agentIndex = html.indexOf('打开文件 Agent')
    const separatorIndex = html.indexOf('role="separator"')
    const createIndex = html.indexOf('新建 · 登录功能')

    expect(html).toContain('data-primary-menu-action="open-file"')
    expect(html).toContain('data-primary-menu-action="open-file-agent"')
    expect(primaryIndex).toBeLessThan(agentIndex)
    expect(agentIndex).toBeLessThan(separatorIndex)
    expect(primaryIndex).toBeLessThan(separatorIndex)
    expect(separatorIndex).toBeLessThan(createIndex)
  })
})

function renderMenu(level: 'component' | 'code'): string {
  return renderToStaticMarkup(
    <FunctionMapContextMenu
      menu={{
        x: 20,
        y: 30,
        anchorNodeId: 'node-login',
        anchorNodeName: '登录功能',
        anchorNodeLevel: level,
        ...(level === 'code'
          ? {
              anchorFilePath: 'app/login/page.tsx',
              anchorParentNodeId: 'feat_login',
            }
          : {}),
      }}
      onClose={vi.fn()}
      onOpenNodeAgentChat={vi.fn()}
      onOpenFile={vi.fn()}
      onOpenFileAgent={vi.fn()}
      onSelect={vi.fn()}
      onCreateWorkGroup={vi.fn()}
    />,
  )
}
