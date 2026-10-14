import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { completeOccurrence, completeTask, fetchChildStats, fetchChildTasks, updateTaskStatus } from '../api'
import ChildDashboard from './ChildDashboard'
import { assignment, mia, occurrence, recurringTask, task } from '../test/fixtures'

vi.mock('../api', () => ({
  fetchChildTasks: vi.fn(),
  fetchChildStats: vi.fn(),
  completeTask: vi.fn(),
  completeOccurrence: vi.fn(),
  updateTaskStatus: vi.fn(),
}))

const done = task({ id: 7, title: 'Done chore', assignments: [assignment(mia.id, { completed: true })] })

describe('ChildDashboard', () => {
  beforeEach(() => {
    vi.mocked(fetchChildTasks).mockResolvedValue([done, task(), recurringTask()])
    vi.mocked(fetchChildStats).mockResolvedValue({ stars: 12, completed_count: 5, streak_days: 3 })
    vi.mocked(completeTask).mockResolvedValue({})
    vi.mocked(completeOccurrence).mockResolvedValue(occurrence(21, '2026-01-03T00:00:00Z'))
    vi.mocked(updateTaskStatus).mockResolvedValue({})
  })

  it('greets the kid with stats, progress and open tasks first', async () => {
    render(<ChildDashboard user={mia} onLogout={vi.fn()} />)
    expect(await screen.findByText('Hi Mia! 👋')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByText('Day streak').previousSibling).toHaveTextContent('3')
    expect(screen.getByRole('progressbar', { name: "Today's progress" })).toHaveAttribute('aria-valuenow', '1')
    expect(screen.getByText('1 of 3 done')).toBeInTheDocument()
    const oneTime = screen.getByRole('region', { name: /One-time missions/ })
    expect(within(oneTime).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Tidy room', 'Done chore'])
  })

  it('celebrates completing a task and refreshes', async () => {
    render(<ChildDashboard user={mia} onLogout={vi.fn()} />)
    const oneTime = await screen.findByRole('region', { name: /One-time missions/ })
    await userEvent.click(within(oneTime).getByRole('button', { name: '✅ I did it!' }))
    expect(completeTask).toHaveBeenCalledWith(1)
    expect(await screen.findByRole('status')).toHaveTextContent('Awesome job!')
    expect(screen.getByTestId('confetti')).toBeInTheDocument()
    expect(fetchChildTasks).toHaveBeenCalledTimes(2)
  })

  it("completes today's occurrence and starts tasks", async () => {
    render(<ChildDashboard user={mia} onLogout={vi.fn()} />)
    const daily = await screen.findByRole('region', { name: /Daily chores/ })
    await userEvent.click(within(daily).getByRole('button', { name: '✅ I did it!' }))
    expect(completeOccurrence).toHaveBeenCalledWith(21)
    await userEvent.click(screen.getByRole('button', { name: "🚀 I'm on it" }))
    expect(updateTaskStatus).toHaveBeenCalledWith(1, 'in_progress')
    expect(await screen.findByText(/Go go go!/)).toBeInTheDocument()
  })

  it('shows errors without confetti', async () => {
    vi.mocked(completeTask).mockRejectedValue(new Error('This task is not active for you yet'))
    render(<ChildDashboard user={mia} onLogout={vi.fn()} />)
    const oneTime = await screen.findByRole('region', { name: /One-time missions/ })
    await userEvent.click(within(oneTime).getByRole('button', { name: '✅ I did it!' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('not active for you yet')
    expect(screen.queryByTestId('confetti')).not.toBeInTheDocument()
  })

  it('shows a friendly empty state', async () => {
    vi.mocked(fetchChildTasks).mockResolvedValue([])
    render(<ChildDashboard user={{ ...mia, full_name: null }} onLogout={vi.fn()} />)
    expect(await screen.findByText(/No tasks right now/)).toBeInTheDocument()
    expect(screen.getByText('Hi mia! 👋')).toBeInTheDocument()
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  })
})
