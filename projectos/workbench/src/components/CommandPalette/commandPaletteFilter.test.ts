import { describe, expect, it } from 'vitest'
import { filterCommandPaletteEntries } from './commandPaletteFilter'

describe('filterCommandPaletteEntries', () => {
  const commands = [
    { label: 'Go to Code', group: 'Navigation' },
    { label: 'src/app.ts', group: 'Files' },
    { label: 'src/app.test.ts', group: 'Files' },
  ]

  it('filters labels across every group', () => {
    expect(filterCommandPaletteEntries(commands, 'code', 'all').map((item) => item.label)).toEqual([
      'Go to Code',
    ])
  })

  it('limits go-to-file mode to files', () => {
    expect(filterCommandPaletteEntries(commands, 'app', 'files').map((item) => item.label)).toEqual([
      'src/app.ts',
      'src/app.test.ts',
    ])
    expect(filterCommandPaletteEntries(commands, '', 'files')).toHaveLength(2)
  })
})
