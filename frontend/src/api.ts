import axios from 'axios'
import { Task, User, Occurrence } from './types'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api',
  timeout: 10000,
})

export const setAuthToken = (token: string | null) => {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`
  } else {
    delete api.defaults.headers.common.Authorization
  }
}

const getAxiosErrorMessage = (error: unknown) => {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail
    const message = typeof detail === 'string' ? detail : error.response?.statusText || error.message
    if (typeof message === 'string') {
      if (message.includes('Email or username already registered')) {
        return 'Email address or username has already been used.'
      }
      return message
    }
  }
  return 'Request failed. Please try again.'
}

export const login = async (email: string, password: string) => {
  const formData = new URLSearchParams()
  formData.append('username', email)
  formData.append('password', password)

  try {
    const response = await api.post('/token', formData)
    return response.data
  } catch (error) {
    throw new Error(getAxiosErrorMessage(error))
  }
}

export const getMe = async () => {
  const response = await api.get<User>('/me')
  return response.data
}

export const fetchUsers = async () => {
  const response = await api.get<User[]>('/admin/users')
  return response.data
}

export const fetchChildren = async () => {
  const response = await api.get<User[]>('/parent/children')
  return response.data
}

export const deleteUser = async (userId: number) => {
  try {
    const response = await api.delete(`/admin/users/${userId}`)
    return response.data
  } catch (error) {
    throw new Error(getAxiosErrorMessage(error))
  }
}

export const updateUser = async (userId: number, user: Partial<User>) => {
  try {
    const response = await api.put<User>(`/admin/users/${userId}`, user)
    return response.data
  } catch (error) {
    throw new Error(getAxiosErrorMessage(error))
  }
}

export const fetchParentTasks = async (status?: string, childId?: number) => {
  const params: Record<string, string | number> = {}
  if (status) params.status = status
  if (childId) params.child_id = childId
  const response = await api.get<Task[]>('/parent/tasks', { params })
  return response.data
}

export const fetchChildTasks = async () => {
  const response = await api.get<Task[]>('/child/tasks')
  return response.data
}

export const fetchStats = async () => {
  const response = await api.get('/parent/tasks/stats')
  return response.data
}

export const completeTask = async (taskId: number) => {
  const response = await api.post(`/child/tasks/${taskId}/complete`)
  return response.data
}

export const updateTaskStatus = async (taskId: number, status: string) => {
  const response = await api.post(`/tasks/${taskId}/status`, { status })
  return response.data
}

export const fetchTaskLogs = async (taskId: number) => {
  const response = await api.get(`/parent/tasks/${taskId}/log`)
  return response.data
}

export const deleteTask = async (taskId: number) => {
  const response = await api.delete(`/parent/tasks/${taskId}`)
  return response.data
}

export const advanceTask = async (taskId: number) => {
  const response = await api.post<Task>(`/parent/tasks/${taskId}/advance`)
  return response.data
}

export const updateTask = async (taskId: number, task: Partial<Task> & { assignee_ids?: number[]; recurrence?: string; task_type?: string }) => {
  const response = await api.put<Task>(`/parent/tasks/${taskId}`, task)
  return response.data
}

export const createTask = async (
  task: Partial<Task> & { assignee_ids: number[]; recurrence?: string; task_type?: string; start_date?: string }
) => {
  const response = await api.post<Task>('/parent/tasks', task)
  return response.data
}

export const createUser = async (user: {
  username?: string
  email: string
  full_name?: string
  role: string
  password: string
}) => {
  const response = await api.post('/admin/users', user)
  return response.data
}

export const resetPassword = async (email: string, password: string) => {
  const response = await api.post('/admin/reset-password', { email, new_password: password })
  return response.data
}

export const fetchOccurrences = async (taskId: number) => {
  const response = await api.get<Occurrence[]>(`/tasks/${taskId}/occurrences`)
  return response.data
}

export const updateOccurrenceStatus = async (occurrenceId: number, status: string) => {
  const response = await api.put(`/occurrences/${occurrenceId}/status`, { status })
  return response.data
}

export const completeOccurrence = async (occurrenceId: number) => {
  const response = await api.post(`/occurrences/${occurrenceId}/complete`)
  return response.data
}

export default api
