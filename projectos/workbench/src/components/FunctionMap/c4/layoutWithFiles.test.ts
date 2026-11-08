import { describe, expect, it } from 'vitest'
import type { FunctionalEdge, FunctionalNode } from '@contracts/index'
import { buildDiagram as buildC4Diagram } from './buildDiagram'
import { applyElkLayoutToDiagram, resolveNodeOverlaps } from './layoutWithElk'

const component = (id: string, files: number): FunctionalNode =>
  ({
    id,
    name: id,
    level: 'component',
    elementType: 'component',
    parentId: 'container_web',
    summary: `${id} does something for the user`,
    linkedFiles: Array.from({ length: files }, (_, index) => ({ path: `src/${id}/file${index}.ts`, role: 'primary' })),
  }) as unknown as FunctionalNode

const edge = (id: string, source: string, target: string): FunctionalEdge =>
  ({ id, source, target, relation: 'calls', label: 'Calls', confidence: 0.9 }) as unknown as FunctionalEdge

/**
 * Feature boxes list their files and are taller for it. After layout no two boxes may overlap (a box was
 * partly covered by the next one on the FastAPI template).
 */
describe('layout of feature boxes that list files', () => {
  it('keeps feature boxes apart', async () => {
    const nodes = [
      { id: 'container_web', name: 'Web', level: 'container', elementType: 'container', linkedFiles: [] } as unknown as FunctionalNode,
      component('auth', 15),
      component('items', 10),
      component('admin', 9),
      component('settings', 6),
      component('client', 12),
    ]
    const edges = [edge('e1', 'auth', 'client'), edge('e2', 'items', 'client'), edge('e3', 'admin', 'client'), edge('e4', 'settings', 'client')]
    const base = buildC4Diagram({ level: 'component', nodes, edges, scope: { parentId: 'container_web' } })
    const laid = await applyElkLayoutToDiagram(base)
    const boxes = laid.nodes.filter((node) => node.level === 'component')
    expect(boxes.length).toBe(5)
    expect(boxes.every((box) => box.height > 150)).toBe(true)
    const overlaps: string[] = []
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i]!
        const b = boxes[j]!
        const apartX = a.position.x + a.width <= b.position.x || b.position.x + b.width <= a.position.x
        const apartY = a.position.y + a.height <= b.position.y || b.position.y + b.height <= a.position.y
        if (!apartX && !apartY) overlaps.push(`${a.id}/${b.id}`)
      }
    }
    expect(overlaps).toEqual([])
  })
})

/**
 * The FastAPI template's frontend features, as the app laid them out: after ELK the boxes were 290 apart,
 * then the step that makes room for connection labels slid 身份验证流程 280px down into 项目管理界面.
 */
describe('making room for connection labels', () => {
  const features: Array<[string, string, number]> = [
    ['comp_auth_flow', '身份验证流程', 16], ['comp_items_ui', '项目管理界面', 10], ['comp_admin_ui', '管理员用户管理', 10],
    ['comp_user_settings', '用户设置', 14], ['comp_app_shell', '应用外壳与导航', 22], ['comp_api_client', '生成的 API 客户端', 17],
    ['comp_e2e_tests', '端到端测试', 12],
  ]
  const links: Array<[string, string, string, string]> = [
    ['ce_auth_client', 'comp_auth_flow', 'comp_api_client', '登录和重置调用'],
    ['ce_items_client', 'comp_items_ui', 'comp_api_client', '项目 CRUD 调用'],
    ['ce_admin_client', 'comp_admin_ui', 'comp_api_client', '用户管理调用'],
    ['ce_settings_client', 'comp_user_settings', 'comp_api_client', '个人资料和密码调用'],
    ['ce_shell_auth', 'comp_app_shell', 'comp_auth_flow', '路由保护'],
    ['ce_e2e_client', 'comp_e2e_tests', 'comp_api_client', '浏览器操作流程'],
  ]

  it('never leaves a feature box on top of another', async () => {
    const nodes: FunctionalNode[] = [
      { id: 'container_frontend', name: 'frontend', level: 'container', elementType: 'container', linkedFiles: [] } as unknown as FunctionalNode,
      ...features.map(([id, name, files]) =>
        ({
          id, name, level: 'component', elementType: 'component', parentId: 'container_frontend', summary: name,
          linkedFiles: Array.from({ length: files }, (_, index) => ({ path: `src/${id}/f${index}.tsx`, role: 'primary' })),
        }) as unknown as FunctionalNode),
    ]
    const edges = links.map(([id, source, target, label]) => ({ id, source, target, label, relation: 'uses', confidence: 0.9 }) as unknown as FunctionalEdge)
    const base = buildC4Diagram({ level: 'component', nodes, edges, scope: { parentId: 'container_frontend' } })
    const laid = await applyElkLayoutToDiagram(base)
    const boxes = laid.nodes.filter((node) => node.level === 'component')
    expect(boxes).toHaveLength(7)
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i]!
        const b = boxes[j]!
        const apartX = a.position.x + a.width <= b.position.x || b.position.x + b.width <= a.position.x
        const apartY = a.position.y + a.height <= b.position.y || b.position.y + b.height <= a.position.y
        expect(apartX || apartY, `${a.label} / ${b.label}`).toBe(true)
      }
    }
  })

  it('moves the lower of two colliding boxes down, and leaves boxes that are clear where they are', () => {
    const sizes = new Map([['a', { width: 200, height: 200 }], ['b', { width: 200, height: 200 }], ['c', { width: 200, height: 200 }]])
    const positions = new Map([['a', { x: 0, y: 0 }], ['b', { x: 0, y: 115 }], ['c', { x: 600, y: 0 }]])
    expect(resolveNodeOverlaps(positions, sizes, 40)).toBe(true)
    expect(positions.get('b')).toEqual({ x: 0, y: 240 })
    expect(positions.get('c')).toEqual({ x: 600, y: 0 })
    expect(resolveNodeOverlaps(positions, sizes, 40)).toBe(false)
  })
})
