import { beforeEach, describe, expect, it, vi } from 'vitest'
import { normalizeLoopGraphDocument } from '@contracts/index'
import { useLoopGraphStore } from './loopGraphStore'
import { useWorkbenchStore } from './workbenchStore'
import { useChatSessionStore } from './chatSessionStore'

const baseDoc = normalizeLoopGraphDocument({
  version: '0.1.0',
  id: 'loop_dept',
  projectId: 'proj',
  title: 'Department loop',
  draft: { revision: 0, graphPrompt: '', nodes: [], edges: [] },
  approvedSpecs: [],
  instances: [],
  linkedSessionIds: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
})

describe('placeDepartmentWorkGroup', () => {
  beforeEach(() => {
    useLoopGraphStore.getState().clear()
    useLoopGraphStore.setState({
      document: baseDoc,
      activeLoopId: 'loop_dept',
      phase: 'draw',
      error: null,
    })
    useWorkbenchStore.setState({
      client: {
        listWorkforceAgents: vi.fn(async () => ({ agents: [] })),
      } as never,
      project: { projectId: 'proj' } as never,
      settings: null,
      setRightPanelOpen: vi.fn(),
    })
    useChatSessionStore.setState({
      createSession: vi.fn(async () => 'sess_dept'),
    } as never)
  })

  it('places a titled department work group with curated members', async () => {
    const workGroupId = await useLoopGraphStore
      .getState()
      .placeDepartmentWorkGroup('workgroup.department.product-architecture', {
        x: 80,
        y: 60,
      })

    expect(workGroupId).toBeTruthy()
    const draft = useLoopGraphStore.getState().document?.draft
    const group = draft?.workGroups?.find((item) => item.id === workGroupId)
    expect(group?.title).toBe('Product & Architecture')
    expect(group?.taskTitle).toBeUndefined()
    expect(useLoopGraphStore.getState().pendingWorkGroupTaskEditId).toBe(
      workGroupId,
    )
    expect(group?.collaborationMode).toBe('coordinator')
    expect(group?.departmentTemplateId).toBe(
      'workgroup.department.product-architecture',
    )
    useLoopGraphStore.getState().renameWorkGroup(workGroupId!, 'Clarify MVP')
    const renamed = useLoopGraphStore
      .getState()
      .document?.draft.workGroups?.find((item) => item.id === workGroupId)
    expect(renamed?.taskTitle).toBe('Clarify MVP')
    expect(renamed?.title).toBe('Product & Architecture · Clarify MVP')
    // Supervisor seat + 3 curated specialists.
    expect(group?.memberNodeIds.length).toBe(4)
    expect(group?.coordinatorNodeId).toBe(group?.memberNodeIds[0])

    const members = draft?.nodes.filter((node) =>
      group?.memberNodeIds.includes(node.id),
    )
    expect(members?.every((node) => Boolean(node.agentDefinitionId))).toBe(
      true,
    )
    const coordinator = members?.find(
      (node) => node.id === group?.coordinatorNodeId,
    )
    expect(coordinator?.title).toBe('Supervisor')
    expect(members?.map((node) => node.title).sort()).toEqual(
      ['Architect', 'Product Planner', 'Supervisor', 'UI/UX Designer'].sort(),
    )
  })

  it('routes department palette ids through beginAuthorNodeFromPalette', async () => {
    const workGroupId = await useLoopGraphStore
      .getState()
      .beginAuthorNodeFromPalette(
        'workgroup.department.quality-infrastructure',
        { x: 40, y: 40 },
      )
    expect(workGroupId).toBeTruthy()
    const group = useLoopGraphStore
      .getState()
      .document?.draft.workGroups?.find((item) => item.id === workGroupId)
    expect(group?.title).toBe('Quality & Infrastructure')
    expect(group?.memberNodeIds.length).toBe(4)
    expect(group?.departmentTemplateId).toBe(
      'workgroup.department.quality-infrastructure',
    )
    const coordinator = useLoopGraphStore
      .getState()
      .document?.draft.nodes.find((node) => node.id === group?.coordinatorNodeId)
    expect(coordinator?.title).toBe('Supervisor')
  })

  it('deletes department members when dissolving (does not release to L1)', async () => {
    const workGroupId = await useLoopGraphStore
      .getState()
      .placeDepartmentWorkGroup('workgroup.department.ai-engineering', {
        x: 20,
        y: 20,
      })
    expect(workGroupId).toBeTruthy()
    const before = useLoopGraphStore.getState().document?.draft
    const memberIds = [
      ...(before?.workGroups?.find((item) => item.id === workGroupId)
        ?.memberNodeIds ?? []),
    ]
    // Supervisor + 2 curated specialists.
    expect(memberIds.length).toBe(3)

    useLoopGraphStore.getState().dissolveWorkGroup(workGroupId!)

    const after = useLoopGraphStore.getState().document?.draft
    expect(after?.workGroups?.some((item) => item.id === workGroupId)).toBe(
      false,
    )
    expect(after?.nodes.some((node) => memberIds.includes(node.id))).toBe(false)
  })

  it('still releases plain work-group members to L1 on dissolve', async () => {
    const workGroupId = useLoopGraphStore
      .getState()
      .createWorkGroupAt({ x: 10, y: 10 })
    expect(workGroupId).toBeTruthy()
    expect(
      useLoopGraphStore
        .getState()
        .document?.draft.workGroups?.find((item) => item.id === workGroupId)
        ?.title,
    ).toBe('Untitled task')
    useLoopGraphStore.getState().renameWorkGroup(workGroupId!, 'Fix login')
    expect(
      useLoopGraphStore
        .getState()
        .document?.draft.workGroups?.find((item) => item.id === workGroupId)
        ?.title,
    ).toBe('Fix login')
    const agentId = await useLoopGraphStore
      .getState()
      .beginAuthorNodeFromPalette('agent.specialist', { x: 30, y: 40 }, {
        agentDefinitionId: 'def_plain',
        title: 'Plain Specialist',
      })
    expect(agentId).toBeTruthy()
    expect(
      useLoopGraphStore.getState().addNodeToWorkGroup(workGroupId!, agentId!),
    ).toBe(true)

    useLoopGraphStore.getState().dissolveWorkGroup(workGroupId!)

    const after = useLoopGraphStore.getState().document?.draft
    const released = after?.nodes.find((node) => node.id === agentId)
    expect(released).toBeTruthy()
    expect(released?.workGroupId).toBeUndefined()
  })
})
