import { describe, expect, it } from 'vitest'
import { parseCloneUrl, repositoryDirectoryName } from './cloneRepository.js'

describe('parseCloneUrl', () => {
  it('accepts public https and git@ URLs', () => {
    expect(parseCloneUrl('https://github.com/org/repo.git')).toBe('https://github.com/org/repo.git')
    expect(parseCloneUrl('git@github.com:org/repo.git')).toBe('git@github.com:org/repo.git')
  })

  it('rejects credentials and shell characters', () => {
    expect(() => parseCloneUrl('https://user:token@github.com/org/repo.git')).toThrow()
    expect(() => parseCloneUrl('https://github.com/org/repo.git; rm -rf /')).toThrow()
  })

  it('derives a folder name from the URL', () => {
    expect(repositoryDirectoryName('https://github.com/org/repo.git')).toBe('repo')
    expect(repositoryDirectoryName('git@github.com:org/repo.git')).toBe('repo')
  })
})
