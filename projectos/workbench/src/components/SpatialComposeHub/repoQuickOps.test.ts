import { describe, expect, it } from 'vitest'
import {
  branchNodeId,
  remoteUrlToHttps,
  resolveRepoSyncButtons,
} from './repoQuickOps'

describe('resolveRepoSyncButtons', () => {
  it('shows Pull when behind-only', () => {
    expect(resolveRepoSyncButtons({ ahead: 0, behind: 2 })).toEqual({
      primary: 'pull',
      showPull: true,
      showPush: false,
    })
  })

  it('shows Push when ahead-only', () => {
    expect(resolveRepoSyncButtons({ ahead: 3, behind: 0 })).toEqual({
      primary: 'push',
      showPull: false,
      showPush: true,
    })
  })

  it('shows both when diverged', () => {
    expect(resolveRepoSyncButtons({ ahead: 1, behind: 1 })).toEqual({
      primary: 'none',
      showPull: true,
      showPush: true,
    })
  })

  it('shows none when synced', () => {
    expect(resolveRepoSyncButtons({ ahead: 0, behind: 0 })).toEqual({
      primary: 'none',
      showPull: false,
      showPush: false,
    })
  })
})

describe('remoteUrlToHttps', () => {
  it('normalizes ssh remotes', () => {
    expect(remoteUrlToHttps('git@github.com:acme/app.git')).toBe(
      'https://github.com/acme/app',
    )
  })
})

describe('branchNodeId', () => {
  it('prefixes branch names', () => {
    expect(branchNodeId('feat/x')).toBe('branch:feat/x')
  })
})
