import type { AgentActionEvent } from '@contracts/index'
import type { OrbState } from './ThinkingOrb'

/** Map agent action events to the closest thinking-orb animation state. */
export function orbStateForAction(event: AgentActionEvent): OrbState {
  switch (event.type) {
    case 'context_assembled':
    case 'file_read':
      return 'searching'
    case 'model_request':
      return event.payload.stage === 'validate' || event.payload.stage === 'validate_batch'
        ? 'solving'
        : 'composing'
    case 'edit_plan_created':
    case 'diff_proposed':
      return 'shaping'
    case 'proposal_validation_result':
    case 'batch_validation_result':
    case 'verification_result':
      return 'solving'
    default:
      return 'working'
  }
}
