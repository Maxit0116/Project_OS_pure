import { describe, expect, it, vi } from 'vitest'
import {
  buildAppMenuTemplate,
  initialAppMenuState,
  type AppMenuTemplateItem,
} from './appMenu.js'

const actions = {
  dispatch: vi.fn(),
  closeWindow: vi.fn(),
}

function itemById(items: AppMenuTemplateItem[], id: string): AppMenuTemplateItem | undefined {
  for (const item of items) {
    if (item.id === id) return item
    if (item.submenu) {
      const nested = itemById(item.submenu, id)
      if (nested) return nested
    }
  }
  return undefined
}

function rolesIn(item: AppMenuTemplateItem | undefined): string[] {
  return (item?.submenu ?? []).flatMap((entry) => entry.role ? [entry.role] : [])
}

describe('buildAppMenuTemplate', () => {
  it('starts from the system locale and disables workspace commands', () => {
    expect(initialAppMenuState('zh-CN').locale).toBe('zh')
    expect(initialAppMenuState('en-US').locale).toBe('en')

    const template = buildAppMenuTemplate(
      initialAppMenuState('en'),
      'Project OS',
      'darwin',
      actions,
    )
    expect(itemById(template, 'file.save')?.enabled).toBe(false)
    expect(itemById(template, 'view.functionMap')?.enabled).toBe(false)
    expect(itemById(template, 'file.openFolder')?.enabled).toBe(true)
    expect(itemById(template, 'file.openRecent')?.submenu?.[0]?.label).toBe('No Recent Projects')
  })

  it('localizes labels and wires recent projects, save, and close window', () => {
    actions.dispatch.mockReset()
    actions.closeWindow.mockReset()
    const template = buildAppMenuTemplate(
      {
        locale: 'zh',
        workspaceOpen: true,
        hasActiveEditor: true,
        recentWorkspaces: [{ name: 'Demo & Co', path: '/tmp/demo' }],
      },
      'Project OS',
      'darwin',
      actions,
    )

    expect(itemById(template, 'menu.file')?.label).toBe('文件')
    expect(itemById(template, 'file.save')?.enabled).toBe(true)
    expect(itemById(template, 'file.save')?.accelerator).toBe('CmdOrCtrl+S')
    const recent = itemById(template, 'file.openRecent')?.submenu?.[0]
    expect(recent?.label).toBe('Demo && Co')
    recent?.click?.(undefined, undefined)
    expect(actions.dispatch).toHaveBeenCalledWith(
      { id: 'open-recent', path: '/tmp/demo' },
      undefined,
    )

    itemById(template, 'file.closeWindow')?.click?.(undefined, undefined)
    expect(actions.closeWindow).toHaveBeenCalledOnce()
  })

  it('keeps system roles and moves reload into the developer submenu', () => {
    const template = buildAppMenuTemplate(
      initialAppMenuState('en'),
      'Project OS',
      'darwin',
      actions,
    )
    const view = itemById(template, 'menu.view')
    expect(rolesIn(view)).toEqual(['resetZoom', 'zoomIn', 'zoomOut', 'togglefullscreen'])
    expect(rolesIn(itemById(template, 'view.developer'))).toEqual([
      'reload',
      'forceReload',
      'toggleDevTools',
    ])
    expect(itemById(template, 'menu.window')?.submenu?.some((entry) => entry.role === 'front')).toBe(true)
    expect(itemById(template, 'app.settings')?.accelerator).toBe('CmdOrCtrl+,')
  })
})
