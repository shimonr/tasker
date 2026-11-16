import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { completeOccurrence, completeTask, fetchChildRedemptions, fetchChildRewards, fetchChildStats, fetchChildTasks, redeemReward, updateProfile, updateTaskStatus } from '../api'
import ChildDashboard from './ChildDashboard'
import { assignment, childStats, mia, occurrence, recurringTask, redemption, reward, task } from '../test/fixtures'

vi.mock('../api', () => ({
  fetchChildTasks: vi.fn(),
  fetchChildStats: vi.fn(),
  fetchChildRewards: vi.fn(),
  fetchChildRedemptions: vi.fn(),
  completeTask: vi.fn(),
  completeOccurrence: vi.fn(),
  updateTaskStatus: vi.fn(),
  redeemReward: vi.fn(),
  updateProfile: vi.fn(),
}))

const done = task({ id: 7, title: 'Done chore', assignments: [assignment(mia.id, { completed: true })] })

const renderDashboard = (user = mia, onUserChange = vi.fn()) => render(<ChildDashboard user={user} onLogout={vi.fn()} onUserChange={onUserChange} />)

const cardFor = (title: string) => screen.getByRole('heading', { name: title }).closest('article') as HTMLElement

describe('ChildDashboard', () => {
  beforeEach(() => {
    vi.mocked(fetchChildTasks).mockResolvedValue([done, task(), recurringTask()])
    vi.mocked(fetchChildStats).mockResolvedValue(childStats({ stars: 12, spent: 4, balance: 8, completed_count: 5, streak_days: 3 }))
    vi.mocked(fetchChildRewards).mockResolvedValue([])
    vi.mocked(fetchChildRedemptions).mockResolvedValue([])
    vi.mocked(completeTask).mockResolvedValue({})
    vi.mocked(completeOccurrence).mockResolvedValue(occurrence(21, '2026-01-03T00:00:00Z'))
    vi.mocked(updateTaskStatus).mockResolvedValue({})
    vi.mocked(redeemReward).mockResolvedValue(redemption())
    vi.mocked(updateProfile).mockResolvedValue({ ...mia, full_name: 'Mia Star', avatar: '🦄', color: '#123456' })
  })

  it('greets the kid with their balance, stats and open tasks first', async () => {
    renderDashboard()
    expect(await screen.findByText('Hi Mia! 👋')).toBeInTheDocument()
    expect(screen.getByText('8')).toBeInTheDocument()
    expect(screen.getByText('Stars').previousSibling).toHaveTextContent('8')
    expect(screen.getByText('Day streak').previousSibling).toHaveTextContent('3')
    expect(screen.getByText("You've earned 12 stars in all and spent 4.")).toBeInTheDocument()
    expect(screen.getByText('You have ⭐ 8 to spend.')).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: "Today's progress" })).toHaveAttribute('aria-valuenow', '1')
    expect(screen.getByText('1 of 3 done')).toBeInTheDocument()
    const oneTime = screen.getByRole('region', { name: /One-time missions/ })
    expect(within(oneTime).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Tidy room', 'Done chore'])
  })

  it('celebrates completing a task and refreshes', async () => {
    renderDashboard()
    const oneTime = await screen.findByRole('region', { name: /One-time missions/ })
    await userEvent.click(within(oneTime).getByRole('button', { name: '✅ I did it!' }))
    expect(completeTask).toHaveBeenCalledWith(1)
    expect(await screen.findByRole('status')).toHaveTextContent('Awesome job!')
    expect(screen.getByTestId('confetti')).toBeInTheDocument()
    expect(fetchChildTasks).toHaveBeenCalledTimes(2)
  })

  it("completes today's occurrence and starts tasks", async () => {
    renderDashboard()
    const daily = await screen.findByRole('region', { name: /Daily chores/ })
    await userEvent.click(within(daily).getByRole('button', { name: '✅ I did it!' }))
    expect(completeOccurrence).toHaveBeenCalledWith(21)
    await userEvent.click(screen.getByRole('button', { name: "🚀 I'm on it" }))
    expect(updateTaskStatus).toHaveBeenCalledWith(1, 'in_progress')
    expect(await screen.findByText(/Go go go!/)).toBeInTheDocument()
  })

  it('shows errors without confetti', async () => {
    vi.mocked(completeTask).mockRejectedValue(new Error('This task is not active for you yet'))
    renderDashboard()
    const oneTime = await screen.findByRole('region', { name: /One-time missions/ })
    await userEvent.click(within(oneTime).getByRole('button', { name: '✅ I did it!' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('not active for you yet')
    expect(screen.queryByTestId('confetti')).not.toBeInTheDocument()
  })

  it('sends tasks that need a grown-up without celebrating, then shows them as waiting', async () => {
    const needsYes = task({ id: 10, title: 'Feed fish', requires_approval: true })
    const waiting = task({ id: 11, title: 'Wash car', requires_approval: true, assignments: [assignment(mia.id, { awaiting_approval: true })] })
    vi.mocked(fetchChildTasks).mockResolvedValueOnce([needsYes]).mockResolvedValue([waiting])
    renderDashboard()
    await userEvent.click(await screen.findByRole('button', { name: '✅ I did it!' }))
    expect(completeTask).toHaveBeenCalledWith(10)
    expect(await screen.findByRole('status')).toHaveTextContent('Sent to your parent to approve 📬')
    expect(screen.queryByTestId('confetti')).not.toBeInTheDocument()

    expect(await screen.findByText('⏳ Waiting for a grown-up to say yes')).toBeInTheDocument()
    expect(within(cardFor('Wash car')).queryByRole('button', { name: '✅ I did it!' })).not.toBeInTheDocument()
  })

  it('sends a repeating chore that needs a grown-up without celebrating', async () => {
    const chore = recurringTask({ requires_approval: true })
    vi.mocked(fetchChildTasks).mockResolvedValue([chore])
    renderDashboard()
    await userEvent.click(await screen.findByRole('button', { name: '✅ I did it!' }))
    expect(completeOccurrence).toHaveBeenCalledWith(21)
    expect(await screen.findByRole('status')).toHaveTextContent('Sent to your parent to approve')
    expect(screen.queryByTestId('confetti')).not.toBeInTheDocument()
  })

  it('shows a friendly empty state', async () => {
    vi.mocked(fetchChildTasks).mockResolvedValue([])
    renderDashboard({ ...mia, full_name: null })
    expect(await screen.findByText(/No tasks right now/)).toBeInTheDocument()
    expect(screen.getByText('Hi mia! 👋')).toBeInTheDocument()
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    expect(screen.getByText(/The shop is empty/)).toBeInTheDocument()
    expect(screen.getByText(/Nothing yet. Save up your stars/)).toBeInTheDocument()
  })

  it('uses the avatar and colour the kid picked', async () => {
    renderDashboard({ ...mia, avatar: '🦄', color: '#123456' })
    expect(await screen.findByText('🦄')).toHaveStyle({ backgroundColor: 'rgb(18, 52, 86)' })
  })

  it('hints when a one-time task is due soon or late, but not when it is done', async () => {
    const today = new Date().toISOString()
    vi.mocked(fetchChildTasks).mockResolvedValue([
      task({ id: 20, title: 'Due now', due_date: today }),
      task({ id: 21, title: 'Late one', due_date: '2020-01-01T12:00:00Z' }),
      task({ id: 22, title: 'Far away', due_date: '2099-01-01T12:00:00Z' }),
      task({ id: 23, title: 'Finished late', due_date: '2020-01-01T12:00:00Z', assignments: [assignment(mia.id, { completed: true })] }),
    ])
    renderDashboard()
    expect(await screen.findByText('⏰ Due today!')).toBeInTheDocument()
    expect(screen.getByText('😬 Overdue! Let’s get it done.')).toBeInTheDocument()
    expect(within(cardFor('Far away')).getByText(/📅 Due/)).toBeInTheDocument()
    expect(within(cardFor('Far away')).queryByText(/Due today|Due tomorrow|Overdue/)).not.toBeInTheDocument()
    expect(within(cardFor('Finished late')).queryByText('😬 Overdue! Let’s get it done.')).not.toBeInTheDocument()
  })

  it('redeems a reward the kid can afford', async () => {
    vi.mocked(fetchChildRewards).mockResolvedValue([reward({ id: 3, name: 'Movie pick', emoji: null, cost: 5 })])
    vi.mocked(fetchChildRedemptions).mockResolvedValueOnce([]).mockResolvedValue([redemption({ reward_name: 'Movie pick' })])
    renderDashboard()
    await userEvent.click(await screen.findByRole('button', { name: 'Redeem Movie pick' }))
    expect(redeemReward).toHaveBeenCalledWith(3)
    expect(await screen.findByRole('status')).toHaveTextContent('Movie pick requested! A grown-up will hand it over 🎁')
    expect(fetchChildRedemptions).toHaveBeenCalledTimes(2)
  })

  it('locks rewards the kid cannot afford yet and says how far away they are', async () => {
    vi.mocked(fetchChildRewards).mockResolvedValue([
      reward({ id: 4, name: 'Big trip', cost: 10 }),
      reward({ id: 5, name: 'Sticker', cost: 9 }),
      reward({ id: 7, name: 'Snack', cost: 8 }),
    ])
    renderDashboard()
    expect(await screen.findByRole('button', { name: 'Redeem Big trip' })).toBeDisabled()
    expect(screen.getByText('Save up 2 more stars for this one!')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Redeem Sticker' })).toBeDisabled()
    expect(screen.getByText('Save up 1 more star for this one!')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Redeem Snack' })).toBeEnabled()
    expect(screen.getByText('Ready to redeem! 🎉')).toBeInTheDocument()
  })

  it('shows why a redemption did not go through', async () => {
    vi.mocked(fetchChildRewards).mockResolvedValue([reward({ id: 6, name: 'Cheap', cost: 1 })])
    vi.mocked(redeemReward).mockRejectedValue(new Error('Not enough stars yet'))
    renderDashboard()
    await userEvent.click(await screen.findByRole('button', { name: 'Redeem Cheap' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Not enough stars yet')
  })

  it('lists my reward requests and badges, earned in colour and locked in grey', async () => {
    vi.mocked(fetchChildRedemptions).mockResolvedValue([redemption({ status: 'fulfilled', reward_name: 'Ice cream' })])
    vi.mocked(fetchChildStats).mockResolvedValue(
      childStats({
        badges: [
          { key: 'first_task', title: 'First mission', emoji: '🎯', earned: true },
          { key: 'streak_3', title: 'On a roll', emoji: '🔥', earned: false },
        ],
      }),
    )
    renderDashboard()
    expect(await screen.findByText('✅ Earned!')).toBeInTheDocument()
    expect(screen.getByText('🔒 Locked')).toBeInTheDocument()
    expect(screen.getByText('🔒 Locked').closest('li')).toHaveClass('grayscale')
    expect(screen.getByText('✅ Earned!').closest('li')).not.toHaveClass('grayscale')
    expect(within(screen.getByRole('list', { name: 'My rewards' })).getByText('Ice cream')).toBeInTheDocument()
    expect(screen.getByText('🎉 Got it!')).toBeInTheDocument()
  })

  it('lets the kid edit their look and passes the saved profile up', async () => {
    const onUserChange = vi.fn()
    renderDashboard(mia, onUserChange)
    await userEvent.click(await screen.findByRole('button', { name: '✏️ Edit my look' }))
    const dialog = screen.getByRole('dialog', { name: 'My look' })
    const form = within(dialog).getByRole('form', { name: 'My look' })
    await userEvent.clear(within(form).getByLabelText('My name'))
    await userEvent.type(within(form).getByLabelText('My name'), 'Mia Star')
    await userEvent.click(within(form).getByLabelText('🦄'))
    await userEvent.click(within(form).getByRole('button', { name: '💾 Save my look' }))
    expect(updateProfile).toHaveBeenCalledWith({ full_name: 'Mia Star', avatar: '🦄', color: '#ff4fa0' })
    expect(onUserChange).toHaveBeenCalledWith(expect.objectContaining({ avatar: '🦄', color: '#123456' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Looking good!')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('keeps the profile editor open when saving fails, and can be closed', async () => {
    vi.mocked(updateProfile).mockRejectedValue(new Error('Name is too long'))
    const onUserChange = vi.fn()
    renderDashboard({ ...mia, color: '#123456', avatar: '🐸' }, onUserChange)
    await userEvent.click(await screen.findByRole('button', { name: '✏️ Edit my look' }))
    await userEvent.click(screen.getByRole('button', { name: '💾 Save my look' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Name is too long')
    expect(screen.getByRole('dialog', { name: 'My look' })).toBeInTheDocument()
    expect(onUserChange).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
