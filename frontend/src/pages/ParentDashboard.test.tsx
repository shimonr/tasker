import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  advanceTask,
  createTask,
  deleteTask,
  fetchChildren,
  fetchParentTasks,
  fetchStats,
  fetchTaskLogs,
  updateOccurrenceStatus,
  updateTask,
  updateTaskStatus,
} from '../api'
import ParentDashboard from './ParentDashboard'
import type { ParentStats } from '../types'
import { assignment, leo, mia, parent, recurringTask, rotatingTask, task } from '../test/fixtures'

vi.mock('../api', () => ({
  advanceTask: vi.fn(),
  createTask: vi.fn(),
  deleteTask: vi.fn(),
  fetchChildren: vi.fn(),
  fetchParentTasks: vi.fn(),
  fetchStats: vi.fn(),
  fetchTaskLogs: vi.fn(),
  updateOccurrenceStatus: vi.fn(),
  updateTask: vi.fn(),
  updateTaskStatus: vi.fn(),
}))

const stats: ParentStats = {
  total_tasks: 3,
  completed_tasks: 1,
  pending_tasks: 2,
  in_progress_tasks: 0,
  failed_tasks: 0,
  children: [
    { child_id: mia.id, name: 'Mia', stars: 9, completed_count: 4, streak_days: 2 },
    { child_id: leo.id, name: 'leo', stars: 3, completed_count: 1, streak_days: 0 },
    { child_id: 4, name: 'Zoe', stars: 2, completed_count: 1, streak_days: 0 },
    { child_id: 5, name: 'Max', stars: 0, completed_count: 0, streak_days: 0 },
  ],
}

const renderDashboard = async () => {
  render(<ParentDashboard user={parent} onLogout={vi.fn()} />)
  await screen.findByRole('heading', { name: 'Tidy room' })
}

describe('ParentDashboard', () => {
  beforeEach(() => {
    vi.mocked(fetchParentTasks).mockResolvedValue([task(), recurringTask(), rotatingTask({ assignments: [assignment(leo.id, { rotation_order: 0 }), assignment(4, { rotation_order: 1, is_active: false })] })])
    vi.mocked(fetchStats).mockResolvedValue(stats)
    vi.mocked(fetchChildren).mockResolvedValue([mia, leo])
    for (const fn of [advanceTask, createTask, deleteTask, updateOccurrenceStatus, updateTask, updateTaskStatus]) vi.mocked(fn).mockResolvedValue({} as never)
  })

  it('shows summary tiles and the star leaderboard', async () => {
    await renderDashboard()
    expect(screen.getByText('Hello, Mom! 🌈')).toBeInTheDocument()
    expect(screen.getByText('All tasks').previousSibling).toHaveTextContent('3')
    const board = screen.getByRole('list', { name: '' })
    expect(within(board).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      '🥇Mia⭐ 9🔥 2',
      '🥈leo⭐ 3🔥 0',
      '🥉Zoe⭐ 2🔥 0',
      expect.stringMatching(/Max⭐ 0🔥 0$/),
    ])
  })

  it('shows placeholders before stats arrive and with no kids', async () => {
    vi.mocked(fetchStats).mockResolvedValue({ ...stats, children: [] })
    vi.mocked(fetchParentTasks).mockResolvedValue([])
    render(<ParentDashboard user={parent} onLogout={vi.fn()} />)
    expect(screen.getByText('All tasks').previousSibling).toHaveTextContent('0')
    expect(await screen.findByText(/Stars appear here/)).toBeInTheDocument()
    expect(await screen.findByText(/No tasks here yet/)).toBeInTheDocument()
  })

  it('filters tasks by kid', async () => {
    await renderDashboard()
    await userEvent.click(screen.getByRole('button', { name: /leo/ }))
    expect(screen.getByRole('button', { name: /leo/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('heading', { name: 'Tidy room' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Trash' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '🌈 Everyone' }))
    expect(screen.getByRole('heading', { name: 'Tidy room' })).toBeInTheDocument()
  })

  it('creates a task and closes the form', async () => {
    await renderDashboard()
    await userEvent.click(screen.getByRole('button', { name: '➕ New task' }))
    const form = screen.getByRole('form', { name: 'New task' })
    await userEvent.type(within(form).getByLabelText('Task name'), 'Walk dog')
    await userEvent.type(within(form).getByLabelText('Due date'), '2099-01-01')
    await userEvent.click(within(form).getByLabelText(/Mia/))
    await userEvent.click(within(form).getByRole('button', { name: '✨ Create task' }))
    expect(createTask).toHaveBeenCalledWith(expect.objectContaining({ title: 'Walk dog', assignee_ids: [mia.id] }))
    expect(await screen.findByRole('status')).toHaveTextContent('Task created!')
    expect(screen.queryByRole('form')).not.toBeInTheDocument()
  })

  it('edits a task, and keeps the form open when saving fails', async () => {
    vi.mocked(updateTask).mockRejectedValueOnce(new Error('Server says no'))
    await renderDashboard()
    await userEvent.click(screen.getAllByRole('button', { name: '✏️ Edit' })[0])
    const form = screen.getByRole('form', { name: 'Edit task' })
    expect(within(form).getByLabelText('Task name')).toHaveValue('Tidy room')
    await userEvent.click(within(form).getByRole('button', { name: '💾 Save changes' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Server says no')
    expect(screen.getByRole('form', { name: 'Edit task' })).toBeInTheDocument()
    await userEvent.click(within(form).getByRole('button', { name: '💾 Save changes' }))
    expect(updateTask).toHaveBeenLastCalledWith(1, expect.objectContaining({ title: 'Tidy room' }))
    expect(await screen.findByText(/Task updated!/)).toBeInTheDocument()
  })

  it('cancels the form', async () => {
    await renderDashboard()
    await userEvent.click(screen.getByRole('button', { name: '➕ New task' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('form')).not.toBeInTheDocument()
  })

  it('changes statuses and passes rotating tasks on', async () => {
    await renderDashboard()
    await userEvent.selectOptions(screen.getAllByLabelText('Task status')[0], 'completed')
    expect(updateTaskStatus).toHaveBeenCalledWith(1, 'completed')
    await userEvent.selectOptions(screen.getByLabelText('Today status'), 'failed')
    expect(updateOccurrenceStatus).toHaveBeenCalledWith(21, 'failed')
    await userEvent.click(screen.getByRole('button', { name: '⏭️ Next kid' }))
    expect(advanceTask).toHaveBeenCalledWith(3)
    expect(await screen.findByText(/Passed to the next kid/)).toBeInTheDocument()
  })

  it('shows the status log with names', async () => {
    vi.mocked(fetchTaskLogs).mockResolvedValue([
      { id: 2, task_id: 1, changed_by: mia.id, previous_status: 'pending', new_status: 'completed', changed_at: '2026-01-02T10:00:00Z' },
      { id: 1, task_id: 1, changed_by: parent.id, previous_status: 'pending', new_status: 'pending', changed_at: '2026-01-01T10:00:00Z' },
    ])
    await renderDashboard()
    await userEvent.click(screen.getAllByRole('button', { name: '📜 Log' })[0])
    const dialog = await screen.findByRole('dialog', { name: 'Tidy room' })
    expect(Array.from(dialog.querySelectorAll('strong')).map((s) => s.textContent)).toEqual(['Mia', 'Mom Rivera'])
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('asks before deleting a task', async () => {
    await renderDashboard()
    await userEvent.click(screen.getByRole('button', { name: 'Delete Tidy room' }))
    await userEvent.click(screen.getByRole('button', { name: 'Keep it' }))
    expect(deleteTask).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Delete Tidy room' }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '🗑️ Delete' }))
    expect(deleteTask).toHaveBeenCalledWith(1)
    expect(await screen.findByText(/Task deleted/)).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
