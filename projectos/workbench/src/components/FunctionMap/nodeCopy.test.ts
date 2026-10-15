import { describe, expect, it } from 'vitest'
import { nodeCardBlurb, nodeDetailCopy, nodePreviewBody } from './nodeCopy'

describe('nodeCopy', () => {
  it('puts the short summary on the card and the longer description in the preview', () => {
    const node = {
      summary: '登录与会话',
      description: '面向终端用户的身份入口，连接账号服务，不保存业务数据。',
      responsibility: '拥有登录、会话和令牌刷新。',
    }

    expect(nodeCardBlurb(node)).toBe('登录与会话')
    expect(nodePreviewBody(node)).toBe(
      '面向终端用户的身份入口，连接账号服务，不保存业务数据。',
    )
    expect(nodeDetailCopy(node)).toEqual({
      description: '面向终端用户的身份入口，连接账号服务，不保存业务数据。',
      responsibility: '拥有登录、会话和令牌刷新。',
    })
  })

  it('does not repeat the card line in the preview when every field matches', () => {
    const node = {
      summary: '登录与会话',
      description: '登录与会话',
      responsibility: '登录与会话',
    }

    expect(nodeCardBlurb(node)).toBe('登录与会话')
    expect(nodePreviewBody(node)).toBeUndefined()
    expect(nodeDetailCopy(node).responsibility).toBeUndefined()
  })

  it('falls back to responsibility for graphs that never set a summary', () => {
    const node = {
      description: '一段较长的说明，用来解释这个模块在系统里的位置。',
      responsibility: '拥有登录。',
    }

    expect(nodeCardBlurb(node)).toBe('拥有登录。')
    expect(nodePreviewBody(node)).toBe(
      '一段较长的说明，用来解释这个模块在系统里的位置。',
    )
  })
})
