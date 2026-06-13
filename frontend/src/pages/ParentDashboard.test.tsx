import { render, screen, waitFor } from '@testing-library/react'
import ParentDashboard from './ParentDashboard'
import { createTask, fetchChildren, fetchParentTasks, fetchStats } from '../api'
import type { User } from '../types'

vi.mock('../api', () => ({
  createTask: vi.fn(),
  fetchChildren: vi.fn(),
  fetchParentTasks: vi.fn(),
  fetchStats: vi.fn(),
  updateTaskStatus: vi.fn(),
  fetchTaskLogs: vi.fn(),
  deleteTask: vi.fn(),
  updateTask: vi.fn(),
  advanceTask: vi.fn(),
}))

const user: User = {
  id: 1,
  email: 'parent@example.com',
  role: 'parent',
  created_at: '2026-01-01T00:00:00.000Z',
}

describe('ParentDashboard', () => {
  beforeEach(() => {
    vi.mocked(fetchChildren).mockResolvedValue([
      { id: 2, email: 'kid@example.com', role: 'child', created_at: '2026-02-01T00:00:00.000Z' },
    ])
    vi.mocked(fetchParentTasks).mockResolvedValue([])
    vi.mocked(fetchStats).mockResolvedValue({ total_tasks: 0, completed_tasks: 0, pending_tasks: 0, in_progress_tasks: 0, failed_tasks: 0 })
  })

  it('renders child assignment checkboxes and summary', async () => {
    render(<ParentDashboard user={user} onLogout={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByLabelText(/kid@example.com/i)).toBeInTheDocument()
    })

    expect(screen.getByRole('button', { name: /all tasks/i })).toBeInTheDocument()
    expect(screen.getByText(/Total tasks/i)).toBeInTheDocument()
  })
})
