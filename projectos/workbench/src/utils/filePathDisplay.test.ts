import { describe, expect, it } from 'vitest'
import { splitFilePath } from './filePathDisplay'

describe('splitFilePath', () => {
  it('splits a nested path', () => {
    expect(splitFilePath('app/api/notifications/route.ts')).toEqual({
      basename: 'route.ts',
      dirname: 'app/api/notifications',
    })
  })

  it('handles a root-level file', () => {
    expect(splitFilePath('README.md')).toEqual({
      basename: 'README.md',
      dirname: '',
    })
  })

  it('normalizes backslashes', () => {
    expect(splitFilePath('lib\\db.ts')).toEqual({
      basename: 'db.ts',
      dirname: 'lib',
    })
  })
})
