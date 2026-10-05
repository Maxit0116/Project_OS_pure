export const PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    price: 9,
    features: ['5 projects', '1 team member', 'Basic analytics'],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 29,
    features: ['Unlimited projects', '5 team members', 'Advanced analytics', 'Priority support'],
    popular: true,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 99,
    features: ['Unlimited everything', 'Custom integrations', 'Dedicated support', 'SLA guarantee'],
  },
]

export const APP_NAME = 'SaaSKit'
export const APP_URL = 'https://saaskit.example.com'
export const ITEMS_PER_PAGE = 20

export const TASK_STATUSES = [
  { value: 'todo', label: 'To do' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'done', label: 'Done' },
] as const

export type TaskStatus = (typeof TASK_STATUSES)[number]['value']

export function isTaskStatus(value: unknown): value is TaskStatus {
  return typeof value === 'string' &&
    TASK_STATUSES.some((status) => status.value === value)
}

export function taskStatusLabel(value: string): string {
  return TASK_STATUSES.find((status) => status.value === value)?.label ??
    `Unknown (${value})`
}
