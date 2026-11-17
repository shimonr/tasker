import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  advanceTask,
  approveOccurrence,
  approveTask,
  createChild,
  createInviteCode,
  createReward,
  createTask,
  deleteReward,
  deleteTask,
  fetchChildren,
  fetchFamily,
  fetchParentTasks,
  fetchPushConfig,
  fetchRedemptions,
  fetchRewards,
  fetchStats,
  fetchTaskLogs,
  fetchWeek,
  fulfillRedemption,
  rejectOccurrence,
  rejectTask,
  updateOccurrenceStatus,
  updateReward,
  updateTask,
  updateTaskStatus,
} from '../api'
import ParentDashboard from './ParentDashboard'
import type { FamilyView, ParentStats, WeekView } from '../types'
import { assignment, leo, mia, occurrence, parent, recurringTask, redemption, reward, rotatingTask, task } from '../test/fixtures'

vi.mock('../api', () => ({
  advanceTask: vi.fn(),
  approveOccurrence: vi.fn(),
  approveTask: vi.fn(),
  createChild: vi.fn(),
  createInviteCode: vi.fn(),
  createReward: vi.fn(),
  createTask: vi.fn(),
  deleteReward: vi.fn(),
  deleteTask: vi.fn(),
  fetchChildren: vi.fn(),
  fetchFamily: vi.fn(),
  fetchParentTasks: vi.fn(),
  fetchPushConfig: vi.fn(),
  subscribePush: vi.fn(),
  unsubscribePush: vi.fn(),
  fetchRedemptions: vi.fn(),
  fetchRewards: vi.fn(),
  fetchStats: vi.fn(),
  fetchTaskLogs: vi.fn(),
  fetchWeek: vi.fn(),
  fulfillRedemption: vi.fn(),
  rejectOccurrence: vi.fn(),
  rejectTask: vi.fn(),
  updateOccurrenceStatus: vi.fn(),
  updateReward: vi.fn(),
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
    { child_id: mia.id, name: 'Mia', stars: 9, spent: 0, balance: 9, completed_count: 4, streak_days: 2, badges: [] },
    { child_id: leo.id, name: 'leo', stars: 3, spent: 0, balance: 3, completed_count: 1, streak_days: 0, badges: [] },
    { child_id: 4, name: 'Zoe', stars: 2, spent: 0, balance: 2, completed_count: 1, streak_days: 0, badges: [] },
    { child_id: 5, name: 'Max', stars: 0, spent: 0, balance: 0, completed_count: 0, streak_days: 0, badges: [], avatar: '🦖', color: '#00ff00' },
  ],
}

const family: FamilyView = { id: 1, name: 'The Riveras', invite_code: 'ABC123', members: [parent, { ...mia, color: '#123456' }, leo] }

const week = (start = '2026-11-16'): WeekView => ({
  start,
  days: Array.from({ length: 7 }, (_, i) => ({ date: new Date(Date.parse(`${start}T00:00:00Z`) + i * 86400000).toISOString().slice(0, 10), items: [] })),
})

const renderDashboard = async () => {
  render(<ParentDashboard user={parent} onLogout={vi.fn()} />)
  await screen.findByRole('heading', { name: 'Tidy room' })
}

describe('ParentDashboard', () => {
  beforeEach(() => {
    vi.mocked(fetchParentTasks).mockResolvedValue([task(), recurringTask(), rotatingTask({ assignments: [assignment(leo.id, { rotation_order: 0 }), assignment(4, { rotation_order: 1, is_active: false })] })])
    vi.mocked(fetchStats).mockResolvedValue(stats)
    vi.mocked(fetchChildren).mockResolvedValue([mia, leo])
    vi.mocked(fetchFamily).mockResolvedValue(family)
    vi.mocked(fetchRewards).mockResolvedValue([reward()])
    vi.mocked(fetchRedemptions).mockResolvedValue([])
    vi.mocked(fetchWeek).mockResolvedValue(week())
    vi.mocked(fetchPushConfig).mockResolvedValue({ public_key: null })
    for (const fn of [
      advanceTask,
      approveOccurrence,
      approveTask,
      createChild,
      createInviteCode,
      createReward,
      createTask,
      deleteReward,
      deleteTask,
      fulfillRedemption,
      rejectOccurrence,
      rejectTask,
      updateOccurrenceStatus,
      updateReward,
      updateTask,
      updateTaskStatus,
    ])
      vi.mocked(fn).mockResolvedValue({} as never)
  })

  it('shows summary tiles and the star leaderboard', async () => {
    await renderDashboard()
    expect(screen.getByText('Hello, Mom! 🌈')).toBeInTheDocument()
    expect(screen.getByText('All tasks').previousSibling).toHaveTextContent('3')
    const board = screen.getByRole('list', { name: 'Star champions' })
    expect(within(board).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      '🥇Mia⭐ 9🔥 2',
      '🥈leo⭐ 3🔥 0',
      '🥉Zoe⭐ 2🔥 0',
      expect.stringMatching(/Max⭐ 0🔥 0$/),
    ])
    expect(within(board).getByText('🦖')).toBeInTheDocument()
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
    expect(screen.queryByRole('form', { name: 'New task' })).not.toBeInTheDocument()
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
    expect(screen.queryByRole('form', { name: 'New task' })).not.toBeInTheDocument()
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

  it('shows the family, its invite link and members', async () => {
    await renderDashboard()
    expect(screen.getByRole('heading', { name: '🏠 The Riveras' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Invite link' })).toHaveValue(`${window.location.origin}/join?code=ABC123`)
    const members = screen.getByRole('list', { name: 'Family members' })
    expect(within(members).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      '🐼Mom Rivera🦸 Parent',
      '🐸Mia🌟 Kid',
      '🦁leo🌟 Kid',
    ])
  })

  it('copies the invite link and makes a new invite code', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    await renderDashboard()
    await userEvent.click(screen.getByRole('button', { name: '📋 Copy link' }))
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/join?code=ABC123`)
    expect(await screen.findByRole('status')).toHaveTextContent('Invite link copied!')

    writeText.mockRejectedValueOnce(new Error('denied'))
    await userEvent.click(screen.getByRole('button', { name: '📋 Copy link' }))
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't copy it")

    vi.mocked(fetchFamily).mockResolvedValue({ ...family, invite_code: 'NEW999' })
    await userEvent.click(screen.getByRole('button', { name: '🎟️ New invite code' }))
    expect(createInviteCode).toHaveBeenCalledTimes(1)
    expect(await screen.findByRole('status')).toHaveTextContent('New invite code ready!')
    expect(await screen.findByDisplayValue(/code=NEW999/)).toBeInTheDocument()
  })

  it('adds a kid with an avatar and colour, then closes the form', async () => {
    await renderDashboard()
    await userEvent.click(screen.getByRole('button', { name: '➕ Add a kid' }))
    const form = screen.getByRole('form', { name: 'Add a kid' })
    await userEvent.type(within(form).getByLabelText('Full name'), 'Zoe Rivera')
    await userEvent.type(within(form).getByLabelText('Email'), 'zoe@example.com')
    await userEvent.type(within(form).getByLabelText('Password (8+ characters)'), 'long-password')
    await userEvent.click(within(form).getByLabelText('🐙'))
    await userEvent.click(within(form).getByRole('button', { name: '✨ Add kid' }))
    expect(createChild).toHaveBeenCalledWith({
      full_name: 'Zoe Rivera',
      email: 'zoe@example.com',
      username: undefined,
      password: 'long-password',
      avatar: '🐙',
      color: '#ff4fa0',
    })
    expect(await screen.findByRole('status')).toHaveTextContent('Kid added!')
    expect(screen.queryByRole('form', { name: 'Add a kid' })).not.toBeInTheDocument()
    expect(fetchChildren).toHaveBeenCalledTimes(2)
  })

  it('keeps the add-a-kid form open when the server refuses', async () => {
    vi.mocked(createChild).mockRejectedValueOnce(new Error('Email address or username has already been used.'))
    await renderDashboard()
    await userEvent.click(screen.getByRole('button', { name: '➕ Add a kid' }))
    const form = screen.getByRole('form', { name: 'Add a kid' })
    await userEvent.type(within(form).getByLabelText('Full name'), 'Zoe')
    await userEvent.type(within(form).getByLabelText('Email'), 'mia@example.com')
    await userEvent.type(within(form).getByLabelText('Username (optional)'), 'zoe')
    await userEvent.type(within(form).getByLabelText('Password (8+ characters)'), 'long-password')
    await userEvent.click(within(form).getByRole('button', { name: '✨ Add kid' }))
    expect(createChild).toHaveBeenCalledWith(expect.objectContaining({ username: 'zoe' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('already been used')
    expect(screen.getByRole('form', { name: 'Add a kid' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('form', { name: 'Add a kid' })).not.toBeInTheDocument()
  })

  it('lists completions waiting for approval and approves or rejects them', async () => {
    vi.mocked(fetchParentTasks).mockResolvedValue([
      task({ assignments: [assignment(mia.id, { awaiting_approval: true })] }),
      recurringTask({
        occurrences: [
          occurrence(21, '2026-01-03T00:00:00Z', { awaiting_approval: true, completed_by: mia.id }),
          occurrence(20, '2026-01-02T00:00:00Z', { awaiting_approval: true, completed_by: null }),
        ],
      }),
    ])
    await renderDashboard()
    const approvals = screen.getByRole('region', { name: /Waiting for your yes \(3\)/ })
    const items = within(approvals).getAllByRole('listitem')
    expect(items.map((li) => li.textContent)).toEqual([
      'Mia says “Tidy room” is done✅ Approve✖️ Reject',
      expect.stringMatching(/^Mia says “Brush teeth” is done/),
      expect.stringMatching(/^A kid says “Brush teeth” is done/),
    ])

    await userEvent.click(within(items[0]).getByRole('button', { name: '✅ Approve' }))
    expect(approveTask).toHaveBeenCalledWith(1, mia.id)
    expect(await screen.findByRole('status')).toHaveTextContent('Stars awarded! ⭐')

    await userEvent.click(within(items[1]).getByRole('button', { name: '✅ Approve' }))
    expect(approveOccurrence).toHaveBeenCalledWith(21)
    await userEvent.click(within(items[2]).getByRole('button', { name: '✖️ Reject' }))
    expect(rejectOccurrence).toHaveBeenCalledWith(20)
    expect(await screen.findByText(/Sent back to try again/)).toBeInTheDocument()
  })

  it('rejects a one-time completion from the approvals list', async () => {
    vi.mocked(fetchParentTasks).mockResolvedValue([task({ assignments: [assignment(leo.id, { awaiting_approval: true })] })])
    await renderDashboard()
    await userEvent.click(within(screen.getByRole('region', { name: /Waiting for your yes/ })).getByRole('button', { name: '✖️ Reject' }))
    expect(rejectTask).toHaveBeenCalledWith(1, leo.id)
  })

  it('hides the approvals section when nothing is waiting', async () => {
    await renderDashboard()
    expect(screen.queryByRole('region', { name: /Waiting for your yes/ })).not.toBeInTheDocument()
  })

  it('lists rewards and hands over a requested reward', async () => {
    vi.mocked(fetchRedemptions).mockResolvedValue([redemption({ id: 4, child_name: 'Mia' })])
    await renderDashboard()
    expect(screen.getByRole('list', { name: 'Rewards' })).toHaveTextContent('Pizza night')
    expect(screen.getByRole('list', { name: 'Reward requests' })).toHaveTextContent('Mia')
    await userEvent.click(screen.getByRole('button', { name: '✅ Fulfill' }))
    expect(fulfillRedemption).toHaveBeenCalledWith(4)
    expect(await screen.findByRole('status')).toHaveTextContent('Handed over! 🎁')
  })

  it('shows the week chart for the family', async () => {
    await renderDashboard()
    expect(await screen.findByRole('heading', { name: '📅 Week at a glance' })).toBeInTheDocument()
    expect(fetchWeek).toHaveBeenCalled()
  })
})
