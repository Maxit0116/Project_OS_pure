import {
  AGENT_DEPARTMENT_ORDER,
  AgentCatalogListingSchema,
  AgentCatalogDocumentSchema,
} from '../src/../../contracts/index.js'

console.log('AGENT_DEPARTMENT_ORDER', AGENT_DEPARTMENT_ORDER)
console.log(
  'parse ok',
  AgentCatalogListingSchema.safeParse({
    id: 'x',
    name: 'X',
    trustTier: 'curated',
    version: '1',
    department: 'software_development',
    suggestedLoopAgentRole: 'coder',
  }).success,
)
console.log('doc schema', Boolean(AgentCatalogDocumentSchema))
