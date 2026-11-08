import { describe, expect, it } from 'vitest'
import { nodeCardBlurb, nodeDetailCopy, nodePreviewBody, nodeFileNames } from './nodeCopy'

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

describe('nodeFileNames', () => {
  it('lists file names, not folders, with the files that carry the logic first and tests last', () => {
    expect(
      nodeFileNames({
        linkedFiles: [
          { path: 'tests/test_login.py', role: 'test' },
          { path: 'backend/app/api/routes/login.py', role: 'primary' },
          { path: 'backend/app/core/config.py', role: 'config' },
          { path: 'backend/app/crud.py', role: 'supporting' },
        ],
      }),
    ).toEqual(['login.py', 'crud.py', 'config.py', 'test_login.py'])
  })

  it('names a file once, keeps the order it was given within a role, and can be capped', () => {
    const linkedFiles = [
      { path: 'a/index.ts', role: 'primary' },
      { path: 'b/index.ts', role: 'primary' },
      { path: 'a/other.ts', role: 'primary' },
    ]
    expect(nodeFileNames({ linkedFiles })).toEqual(['index.ts', 'other.ts'])
    expect(nodeFileNames({ linkedFiles }, 1)).toEqual(['index.ts'])
    expect(nodeFileNames({})).toEqual([])
    expect(nodeFileNames({ linkedFiles: null })).toEqual([])
  })
})
