import { describe, expect, it } from 'vitest'

import { emptyFlowCopy } from './AgentFlowPanel'

const ts = (path: string) => `[${path}]`

describe('what the flow says before any run exists', () => {
  it('says how the flow starts when nothing went wrong', () => {
    expect(emptyFlowCopy(null, ts)).toEqual({ title: '[agentFlow.emptyTitle]', description: '[agentFlow.emptyDesc]' })
  })

  it('says why there is nothing to show when the request failed before a run existed', () => {
    expect(emptyFlowCopy("Master discovery referenced unknown node 'code_file_x'", ts)).toEqual({
      title: '[agentFlow.errorTitle]',
      description: "Master discovery referenced unknown node 'code_file_x'",
    })
  })
})
