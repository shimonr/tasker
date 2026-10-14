import axios from 'axios'
import type {
  ChildStats,
  NewUser,
  Occurrence,
  ParentStats,
  StatusLog,
  Task,
  TaskInput,
  TaskStatus,
  User,
  UserUpdate,
} from './types'

// Same-origin "/api" by default (nginx or the Vite dev proxy forwards it to the backend).
const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 15000,
})

let onUnauthorized: () => void = () => {}

export const setUnauthorizedHandler = (handler: () => void) => {
  onUnauthorized = handler
}

export const setAuthToken = (token: string | null) => {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`
  } else {
    delete api.defaults.headers.common.Authorization
  }
}

interface ValidationIssue {
  loc: (string | number)[]
  msg: string
}

export const messageFrom = (error: unknown): string => {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail
    if (detail === 'Email or username already registered') return 'Email address or username has already been used.'
    if (typeof detail === 'string') return detail
    if (Array.isArray(detail)) {
      return (detail as ValidationIssue[]).map((issue) => `${issue.loc[issue.loc.length - 1]}: ${issue.msg}`).join(' ')
    }
    if (!error.response) return "Can't reach the server. Check your connection and try again."
  }
  return 'Something went wrong. Please try again.'
}

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (axios.isAxiosError(error) && error.response?.status === 401 && error.config?.url !== '/token') {
      onUnauthorized()
    }
    return Promise.reject(new Error(messageFrom(error)))
  },
)

const data = <T>(request: Promise<{ data: T }>) => request.then((response) => response.data)

export const login = (username: string, password: string) =>
  data<{ access_token: string }>(api.post('/token', new URLSearchParams({ username, password })))
export const forgotPassword = (email: string) => data<{ message: string }>(api.post('/auth/forgot-password', { email }))
export const resetPasswordWithToken = (token: string, newPassword: string) =>
  data<{ message: string }>(api.post('/auth/reset-password', { token, new_password: newPassword }))
export const getMe = () => data<User>(api.get('/me'))

export const fetchUsers = () => data<User[]>(api.get('/admin/users'))
export const createUser = (user: NewUser) => data<User>(api.post('/admin/users', user))
export const updateUser = (userId: number, user: UserUpdate) => data<User>(api.put(`/admin/users/${userId}`, user))
export const deleteUser = (userId: number) => data(api.delete(`/admin/users/${userId}`))
export const resetPassword = (email: string, password: string) =>
  data(api.post('/admin/reset-password', { email, new_password: password }))

export const fetchChildren = () => data<User[]>(api.get('/parent/children'))
export const fetchParentTasks = () => data<Task[]>(api.get('/parent/tasks'))
export const fetchStats = () => data<ParentStats>(api.get('/parent/tasks/stats'))
export const createTask = (task: TaskInput) => data<Task>(api.post('/parent/tasks', task))
export const updateTask = (taskId: number, task: TaskInput) => data<Task>(api.put(`/parent/tasks/${taskId}`, task))
export const deleteTask = (taskId: number) => data(api.delete(`/parent/tasks/${taskId}`))
export const advanceTask = (taskId: number) => data<Task>(api.post(`/parent/tasks/${taskId}/advance`))
export const fetchTaskLogs = (taskId: number) => data<StatusLog[]>(api.get(`/parent/tasks/${taskId}/log`))
export const updateTaskStatus = (taskId: number, status: TaskStatus) => data(api.post(`/tasks/${taskId}/status`, { status }))
export const updateOccurrenceStatus = (occurrenceId: number, status: TaskStatus) =>
  data<Occurrence>(api.put(`/occurrences/${occurrenceId}/status`, { status }))

export const fetchChildTasks = () => data<Task[]>(api.get('/child/tasks'))
export const fetchChildStats = () => data<ChildStats>(api.get('/child/stats'))
export const completeTask = (taskId: number) => data(api.post(`/child/tasks/${taskId}/complete`))
export const completeOccurrence = (occurrenceId: number) => data<Occurrence>(api.post(`/occurrences/${occurrenceId}/complete`))

export default api
