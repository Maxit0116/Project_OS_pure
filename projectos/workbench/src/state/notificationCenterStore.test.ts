import { beforeEach, describe, expect, it } from 'vitest'
import {
  selectGroupActive,
  selectNotificationStacks,
  useNotificationCenterStore,
} from './notificationCenterStore'

describe('notificationCenterStore', () => {
  beforeEach(() => {
    try {
      localStorage?.clear?.()
    } catch {
      /* vitest node env may lack localStorage */
    }
    useNotificationCenterStore.setState({ items: [], expandedGroups: {} })
  })

  it('keeps active notifications and archives on dismiss', () => {
    const id = useNotificationCenterStore.getState().pushNotification({
      kind: 'agent_diff',
      title: 'Ready',
      body: 'Review diff',
      destination: 'diff',
      runIds: ['run-1'],
    })
    expect(selectGroupActive(useNotificationCenterStore.getState().items, 'diff')).toHaveLength(1)

    useNotificationCenterStore.getState().archiveNotification(id)
    expect(selectGroupActive(useNotificationCenterStore.getState().items, 'diff')).toHaveLength(0)
    expect(
      useNotificationCenterStore.getState().items.filter((item) => item.status === 'archived'),
    ).toHaveLength(1)
  })

  it('puts different kinds into separate stacks with newest on top', () => {
    useNotificationCenterStore.getState().pushNotification({
      kind: 'agent_ask',
      title: 'Ask 1',
      body: 'older',
      destination: 'ask',
    })
    useNotificationCenterStore.getState().pushNotification({
      kind: 'reminder',
      title: 'Reminder',
      body: 'due',
      destination: 'reminder',
    })
    useNotificationCenterStore.getState().pushNotification({
      kind: 'agent_ask',
      title: 'Ask 2',
      body: 'newer',
      destination: 'ask',
    })

    const stacks = selectNotificationStacks(useNotificationCenterStore.getState().items)
    expect(stacks.map((stack) => stack.group)).toEqual(['ask', 'reminder'])
    expect(stacks[0]?.active.map((item) => item.title)).toEqual(['Ask 2', 'Ask 1'])
  })

  it('deletes an entire typed stack', () => {
    useNotificationCenterStore.getState().pushNotification({
      kind: 'decision',
      title: 'A',
      body: 'one',
      destination: 'decisions',
    })
    useNotificationCenterStore.getState().pushNotification({
      kind: 'decision',
      title: 'B',
      body: 'two',
      destination: 'decisions',
    })
    useNotificationCenterStore.getState().removeGroup('decision', 'all')
    expect(selectGroupActive(useNotificationCenterStore.getState().items, 'decision')).toHaveLength(
      0,
    )
  })

  it('removes ephemeral notifications instead of shelving them', () => {
    const id = useNotificationCenterStore.getState().pushNotification({
      kind: 'first_principles_suggest',
      title: 'First Principles',
      body: 'Suggest',
      ephemeral: true,
      visionText: '我想加一个助手',
    })
    expect(selectGroupActive(useNotificationCenterStore.getState().items, 'ask')).toHaveLength(1)

    useNotificationCenterStore.getState().archiveNotification(id)
    expect(useNotificationCenterStore.getState().items).toHaveLength(0)
  })

  it('replaces a prior active first-principles suggest', () => {
    useNotificationCenterStore.getState().pushNotification({
      kind: 'first_principles_suggest',
      title: 'First Principles',
      body: 'old',
      ephemeral: true,
      visionText: 'old vision',
    })
    useNotificationCenterStore.getState().pushNotification({
      kind: 'first_principles_suggest',
      title: 'First Principles',
      body: 'new',
      ephemeral: true,
      visionText: 'new vision',
    })
    const active = selectGroupActive(useNotificationCenterStore.getState().items, 'ask')
    expect(active).toHaveLength(1)
    expect(active[0]?.body).toBe('new')
    expect(active[0]?.visionText).toBe('new vision')
  })
})
