import { describe, expect, it } from 'vitest'
import {
  buildGithubGraphRecoveryPrompt,
  classifyGithubGraphBlocker,
  isGithubGraphAgentRecoverable,
} from './githubGraphAgentRecovery'

describe('githubGraphAgentRecovery', () => {
  it('classifies dirty working tree messages', () => {
    expect(
      classifyGithubGraphBlocker(
        'Working tree is dirty. Commit or stash changes before switching branches.',
      ),
    ).toBe('working-tree-dirty')
    expect(
      isGithubGraphAgentRecoverable(
        'Working tree is dirty — commit or stash before checkout.',
      ),
    ).toBe(true)
  })

  it('classifies conflict messages', () => {
    expect(
      classifyGithubGraphBlocker(
        'Revert failed (often conflicts): could not apply',
      ),
    ).toBe('merge-conflict')
  })

  it('ignores unrelated errors', () => {
    expect(classifyGithubGraphBlocker('Sign in with GitHub')).toBeNull()
    expect(isGithubGraphAgentRecoverable('Could not push branch.')).toBe(false)
  })

  it('builds a recovery prompt that mentions cleanup and pending checkout', () => {
    const prompt = buildGithubGraphRecoveryPrompt({
      kind: 'working-tree-dirty',
      blockerMessage: 'Working tree is dirty.',
      pending: { type: 'checkout', branch: 'feat/x', nodeId: 'branch:feat/x' },
      defaultBranch: 'main',
    })
    expect(prompt).toMatch(/dirty working tree/i)
    expect(prompt).toMatch(/feat\/x/)
    expect(prompt).toMatch(/Do not force-push/)
  })
})
