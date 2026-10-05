import { describe, expect, it } from 'vitest'

import { ProjectOSError } from '../../../errors.js'
import { wrapProjectOsHandler } from './ipcError.js'

describe('ProjectOS IPC error serialization', () => {
  it('drops arbitrary details while retaining the bounded ownership discriminator', async () => {
    await expect(wrapProjectOsHandler(() => {
      throw new ProjectOSError('agent_orchestration_failed', 'failed', {
        details: { secret: 'provider-reasoning', absolutePath: '/private/workspace' },
      })
    })).rejects.not.toHaveProperty('details')

    await expect(wrapProjectOsHandler(() => {
      throw new ProjectOSError('ownership_ambiguous', 'choose an owner', {
        details: {
          selectedFilePath: 'src/a.ts',
          candidateNodeIds: ['component_a', 'component_b'],
        },
      })
    })).rejects.toMatchObject({
      details: {
        selectedFilePath: 'src/a.ts',
        candidateNodeIds: ['component_a', 'component_b'],
      },
    })
  })
})
