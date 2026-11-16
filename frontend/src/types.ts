export type UserRole = 'admin' | 'parent' | 'child'

export interface User {
  id: number
  email: string
  username?: string | null
  full_name?: string | null
  role: UserRole
  created_at: string
  family_id?: number | null
  family_name?: string | null
  avatar?: string | null
  color?: string | null
}

export interface Token {
  access_token: string
  token_type: string
}

export interface SignupInput {
  family_name: string
  full_name: string
  email: string
  username?: string
  password: string
}

export interface JoinInput {
  invite_code: string
  role: 'parent' | 'child'
  full_name: string
  email: string
  username?: string
  password: string
}

export interface FamilyView {
  id: number
  name: string
  invite_code: string
  members: User[]
}

export interface FamilySummary {
  id: number
  name: string
  member_count: number
}

export type TaskStatus = 'pending' | 'in_progress' | 'failed' | 'completed'

export type TaskType = 'adhoc' | 'recurring' | 'rotating'

export type Recurrence = 'daily' | 'weekly' | 'monthly' | 'yearly'

export type Priority = 'Low' | 'Medium' | 'High'

export interface Assignment {
  id: number
  child_id: number
  completed: boolean
  completed_at?: string | null
  assigned_at: string
  rotation_order?: number | null
  is_active: boolean
  awaiting_approval: boolean
}

export interface Occurrence {
  id: number
  task_id: number
  occurrence_date: string
  status: TaskStatus
  completed_at?: string | null
  completed_by?: number | null
  awaiting_approval: boolean
}

export interface Task {
  id: number
  title: string
  description?: string | null
  due_date?: string | null
  start_date?: string | null
  priority?: string | null
  recurrence?: Recurrence | null
  task_type: TaskType
  status: TaskStatus
  requires_approval: boolean
  created_by: number
  created_at: string
  assignments: Assignment[]
  occurrences: Occurrence[]
}

export interface TaskInput {
  title: string
  description?: string
  due_date?: string
  start_date?: string
  priority?: Priority
  assignee_ids: number[]
  recurrence?: Recurrence
  task_type: TaskType
  requires_approval?: boolean
}

export interface StatusLog {
  id: number
  task_id: number
  changed_by: number
  previous_status: TaskStatus
  new_status: TaskStatus
  changed_at: string
}

export interface Badge {
  key: string
  title: string
  emoji: string
  earned: boolean
}

export interface ChildStats {
  stars: number
  spent: number
  balance: number
  completed_count: number
  streak_days: number
  badges: Badge[]
}

export interface LeaderboardEntry extends ChildStats {
  child_id: number
  name: string
  avatar?: string | null
  color?: string | null
}

export interface ParentStats {
  total_tasks: number
  completed_tasks: number
  pending_tasks: number
  in_progress_tasks: number
  failed_tasks: number
  children: LeaderboardEntry[]
}

export interface NewUser {
  username?: string
  email: string
  full_name?: string
  role: UserRole
  password: string
  family_id?: number
}

export type UserUpdate = Partial<Pick<User, 'username' | 'email' | 'full_name' | 'role'>>

export interface NewChild {
  full_name: string
  email: string
  username?: string
  password: string
  avatar?: string
  color?: string
}

export interface ProfileUpdate {
  full_name?: string
  avatar?: string
  color?: string
}

export interface Reward {
  id: number
  name: string
  emoji?: string | null
  cost: number
  active: boolean
}

export interface RewardInput {
  name: string
  emoji?: string
  cost: number
}

export interface RewardUpdate {
  name?: string
  emoji?: string
  cost?: number
  active?: boolean
}

export interface Redemption {
  id: number
  reward_id?: number | null
  reward_name: string
  reward_emoji?: string | null
  child_id: number
  child_name: string
  cost: number
  status: 'requested' | 'fulfilled'
  created_at: string
  fulfilled_at?: string | null
}

export interface WeekItem {
  task_id: number
  occurrence_id?: number | null
  title: string
  priority?: string | null
  child_id: number
  child_name: string
  status: TaskStatus
  awaiting_approval: boolean
  due_date?: string | null
}

export interface WeekView {
  start: string
  days: { date: string; items: WeekItem[] }[]
}
