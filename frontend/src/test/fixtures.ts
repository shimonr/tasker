import type { Assignment, ChildStats, Occurrence, Redemption, Reward, Task, User } from '../types'

export const parent: User = { id: 1, email: 'mom@example.com', username: 'mom', full_name: 'Mom Rivera', role: 'parent', created_at: '2026-01-01T00:00:00Z' }
export const mia: User = { id: 2, email: 'mia@example.com', username: 'mia', full_name: 'Mia', role: 'child', created_at: '2026-01-02T00:00:00Z' }
export const leo: User = { id: 3, email: 'leo@example.com', username: 'leo', full_name: null, role: 'child', created_at: '2026-01-03T00:00:00Z' }
export const admin: User = { id: 9, email: 'admin@example.com', username: 'admin', full_name: 'Administrator', role: 'admin', created_at: '2026-01-01T00:00:00Z' }

export const assignment = (childId: number, extra: Partial<Assignment> = {}): Assignment => ({
  id: childId * 10,
  child_id: childId,
  completed: false,
  assigned_at: '2026-01-01T00:00:00Z',
  is_active: true,
  awaiting_approval: false,
  ...extra,
})

export const occurrence = (id: number, date: string, extra: Partial<Occurrence> = {}): Occurrence => ({
  id,
  task_id: 1,
  occurrence_date: date,
  status: 'pending',
  awaiting_approval: false,
  ...extra,
})

export const task = (extra: Partial<Task> = {}): Task => ({
  id: 1,
  title: 'Tidy room',
  description: 'Toys in the box',
  due_date: '2030-05-01T12:00:00Z',
  priority: 'High',
  task_type: 'adhoc',
  status: 'pending',
  requires_approval: false,
  created_by: parent.id,
  created_at: '2026-01-01T00:00:00Z',
  assignments: [assignment(mia.id)],
  occurrences: [],
  ...extra,
})

export const recurringTask = (extra: Partial<Task> = {}): Task =>
  task({
    id: 2,
    title: 'Brush teeth',
    task_type: 'recurring',
    recurrence: 'daily',
    due_date: null,
    priority: 'Medium',
    start_date: '2026-01-01T00:00:00Z',
    occurrences: [occurrence(21, '2026-01-03T00:00:00Z'), occurrence(20, '2026-01-02T00:00:00Z', { status: 'completed' })],
    ...extra,
  })

export const rotatingTask = (extra: Partial<Task> = {}): Task =>
  task({
    id: 3,
    title: 'Trash',
    task_type: 'rotating',
    due_date: null,
    priority: null,
    assignments: [assignment(mia.id, { rotation_order: 0 }), assignment(leo.id, { rotation_order: 1, is_active: false })],
    ...extra,
  })

export const reward = (extra: Partial<Reward> = {}): Reward => ({ id: 1, name: 'Pizza night', emoji: '🍕', cost: 10, active: true, ...extra })

export const redemption = (extra: Partial<Redemption> = {}): Redemption => ({
  id: 1,
  reward_id: 1,
  reward_name: 'Pizza night',
  reward_emoji: '🍕',
  child_id: mia.id,
  child_name: 'Mia',
  cost: 10,
  status: 'requested',
  created_at: '2026-01-05T10:00:00Z',
  fulfilled_at: null,
  ...extra,
})

export const childStats = (extra: Partial<ChildStats> = {}): ChildStats => ({
  stars: 0,
  spent: 0,
  balance: 0,
  completed_count: 0,
  streak_days: 0,
  badges: [],
  ...extra,
})
