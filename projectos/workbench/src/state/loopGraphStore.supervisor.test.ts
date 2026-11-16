import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  LOOP_WORK_GROUP_SUPERVISOR_DUTY_IDS,
  LOOP_WORK_GROUP_SUPERVISOR_PALETTE_ID,
  nodeHasSupervisorDuties,
  normalizeLoopGraphDocument,
} from '@contracts/index'
import { useLoopGraphStore } from './loopGraphStore'
import { useWorkbenchStore } from './workbenchStore'
import { useChatSessionStore } from './chatSessionStore'

const baseDoc = normalizeLoopGraphDocument({
  version: '0.1.0',
  id: 'loop_sv',
  projectId: 'proj',
  title: 'Supervisor loop',
  draft: { revision: 0, graphPrompt: '', nodes: [], edges: [] },
  approvedSpecs: [],
  instances: [],
  linkedSessionIds: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
})

describe('work group supervisor staffing', () => {
  beforeEach(() => {
    useLoopGraphStore.getState().clear()
    useLoopGraphStore.setState({
      document: baseDoc,
      activeLoopId: 'loop_sv',
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
      createSession: vi.fn(async () => 'sess_sv'),
    } as never)
  })

  it('seeds a Supervisor coordinator when creating an empty work group', async () => {
    const workGroupId = await useLoopGraphStore
      .getState()
      .createWorkGroupWithSupervisorAt({ x: 40, y: 60 })

    expect(workGroupId).toBeTruthy()
    const draft = useLoopGraphStore.getState().document?.draft
    const group = draft?.workGroups?.find((item) => item.id === workGroupId)
    expect(group?.memberNodeIds.length).toBe(1)
    expect(group?.coordinatorNodeId).toBe(group?.memberNodeIds[0])
    expect(group?.collaborationMode).toBe('coordinator')

    const supervisor = draft?.nodes.find(
      (node) => node.id === group?.coordinatorNodeId,
    )
    expect(supervisor?.title).toBe('Supervisor')
    expect(supervisor?.agentDefinitionId).toBeTruthy()
    expect(nodeHasSupervisorDuties(supervisor ?? {})).toBe(true)
    expect(
      supervisor?.dutyItems?.some(
        (duty) => duty.id === LOOP_WORK_GROUP_SUPERVISOR_DUTY_IDS.propose,
      ),
    ).toBe(true)
  })

  it('routes palette workgroup.create through Supervisor seeding', async () => {
    const workGroupId = await useLoopGraphStore
      .getState()
      .beginAuthorNodeFromPalette('workgroup.create', { x: 10, y: 20 })
    expect(workGroupId).toBeTruthy()
    const group = useLoopGraphStore
      .getState()
      .document?.draft.workGroups?.find((item) => item.id === workGroupId)
    expect(group?.memberNodeIds.length).toBe(1)
  })

  it('applies supervisor duties to department coordinators', async () => {
    const workGroupId = await useLoopGraphStore
      .getState()
      .placeDepartmentWorkGroup('workgroup.department.product-architecture', {
        x: 0,
        y: 0,
      })
    expect(workGroupId).toBeTruthy()
    const draft = useLoopGraphStore.getState().document?.draft
    const group = draft?.workGroups?.find((item) => item.id === workGroupId)
    const coordinator = draft?.nodes.find(
      (node) => node.id === group?.coordinatorNodeId,
    )
    expect(nodeHasSupervisorDuties(coordinator ?? {})).toBe(true)
  })

  it('proposes, confirms, and admits a specialist into the work group', async () => {
    const workGroupId = await useLoopGraphStore
      .getState()
      .createWorkGroupWithSupervisorAt({ x: 0, y: 0 })
    expect(workGroupId).toBeTruthy()

    const proposalId = useLoopGraphStore.getState().proposeWorkGroupStaffing(
      workGroupId!,
      {
        reason: 'Need frontend UI work',
        suggestedPaletteItemId: 'agent.curated.frontend-engineer',
      },
    )
    expect(proposalId).toBeTruthy()

    const pending = useLoopGraphStore
      .getState()
      .document?.draft.workGroups?.find((item) => item.id === workGroupId)
      ?.staffingProposals?.find((item) => item.id === proposalId)
    expect(pending?.status).toBe('pending')

    const admittedId = await useLoopGraphStore
      .getState()
      .confirmWorkGroupStaffingProposal(workGroupId!, proposalId!)
    expect(admittedId).toBeTruthy()

    const draft = useLoopGraphStore.getState().document?.draft
    const group = draft?.workGroups?.find((item) => item.id === workGroupId)
    expect(group?.memberNodeIds).toContain(admittedId)
    expect(group?.memberNodeIds.length).toBe(2)
    const proposal = group?.staffingProposals?.find(
      (item) => item.id === proposalId,
    )
    expect(proposal?.status).toBe('accepted')
    expect(proposal?.admittedNodeId).toBe(admittedId)

    const admitted = draft?.nodes.find((node) => node.id === admittedId)
    expect(admitted?.workGroupId).toBe(workGroupId)
    expect(admitted?.title).toMatch(/Frontend/i)
  })

  it('dismisses a pending staffing proposal without admitting', async () => {
    const workGroupId = await useLoopGraphStore
      .getState()
      .createWorkGroupWithSupervisorAt({ x: 0, y: 0 })
    const proposalId = useLoopGraphStore.getState().proposeWorkGroupStaffing(
      workGroupId!,
      { reason: 'architecture review needed' },
    )
    expect(proposalId).toBeTruthy()

    useLoopGraphStore
      .getState()
      .dismissWorkGroupStaffingProposal(workGroupId!, proposalId!)

    const group = useLoopGraphStore
      .getState()
      .document?.draft.workGroups?.find((item) => item.id === workGroupId)
    expect(
      group?.staffingProposals?.find((item) => item.id === proposalId)?.status,
    ).toBe('dismissed')
    expect(group?.memberNodeIds.length).toBe(1)
  })

  it('keeps Supervisor palette id stable for seeds', () => {
    expect(LOOP_WORK_GROUP_SUPERVISOR_PALETTE_ID).toBe(
      'agent.curated.workgroup-supervisor',
    )
  })
})
