import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useWorkbenchStore } from '../state/workbenchStore'
import KeyboardShortcutsDialog from './KeyboardShortcutsDialog'

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

describe('KeyboardShortcutsDialog', () => {
  it('lists the basic shortcut groups', () => {
    useWorkbenchStore.setState({ locale: 'zh' })
    const html = renderToStaticMarkup(<KeyboardShortcutsDialog onClose={() => undefined} />)
    expect(html).toContain('键盘快捷键')
    expect(html).toContain('打开文件夹')
    expect(html).toContain('命令面板')
    expect(html).toContain('转到文件')
    expect(html).toContain('新建终端')
    expect(html).toContain('role="dialog"')
  })
})
