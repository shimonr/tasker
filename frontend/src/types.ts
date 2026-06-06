export type UserRole = 'admin' | 'parent' | 'child'

export interface User {
  id: number
  email: string
  username?: string
  full_name?: string
  role: UserRole
  created_at: string
}

export type TaskStatus = 'pending' | 'in_progress' | 'failed' | 'completed'

export interface Assignment {
  id: number
  child_id: number
  completed: boolean
  completed_at?: string
  assigned_at: string
}

export interface Task {
  id: number
  title: string
  description?: string
  due_date?: string
  start_date?: string
  priority?: string
  recurrence?: 'daily' | 'weekly' | 'monthly' | 'yearly'
  status: TaskStatus
  created_by: number
  created_at: string
  assignments: Assignment[]
}
