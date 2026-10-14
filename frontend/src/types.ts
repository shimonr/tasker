export type UserRole = 'admin' | 'parent' | 'child'

export interface User {
  id: number
  email: string
  username?: string | null
  full_name?: string | null
  role: UserRole
  created_at: string
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
}

export interface Occurrence {
  id: number
  task_id: number
  occurrence_date: string
  status: TaskStatus
  completed_at?: string | null
  completed_by?: number | null
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
}

export interface StatusLog {
  id: number
  task_id: number
  changed_by: number
  previous_status: TaskStatus
  new_status: TaskStatus
  changed_at: string
}

export interface ChildStats {
  stars: number
  completed_count: number
  streak_days: number
}

export interface LeaderboardEntry extends ChildStats {
  child_id: number
  name: string
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
}

export type UserUpdate = Partial<Pick<User, 'username' | 'email' | 'full_name' | 'role'>>
