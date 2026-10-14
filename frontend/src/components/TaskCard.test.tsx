import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TaskCard from './TaskCard'
import type { Task } from '../types'
import { assignment, leo, mia, occurrence, recurringTask, rotatingTask, task } from '../test/fixtures'

const parentProps = () => ({
  viewer: 'parent' as const,
  kids: [mia, leo],
  onStatusChange: vi.fn(),
  onOccurrenceStatusChange: vi.fn(),
  onShowLog: vi.fn(),
  onDelete: vi.fn(),
  onEdit: vi.fn(),
  onAdvance: vi.fn(),
})

const childProps = (childId = mia.id) => ({
  viewer: 'child' as const,
  childId,
  onComplete: vi.fn(),
  onStart: vi.fn(),
  onCompleteOccurrence: vi.fn(),
})

describe('TaskCard for parents', () => {
  it('shows details, assignees and all parent actions', async () => {
    const props = parentProps()
    const t = task({ assignments: [assignment(mia.id, { completed: true }), assignment(leo.id)] })
    render(<TaskCard task={t} {...props} />)

    expect(screen.getByRole('heading', { name: 'Tidy room' })).toBeInTheDocument()
    expect(screen.getByText('Toys in the box')).toBeInTheDocument()
    expect(screen.getByText(/Due .*2030/)).toBeInTheDocument()
    expect(screen.getByTitle('High priority')).toHaveTextContent('🔥 ⭐⭐⭐')
    expect(screen.getByText('👥 Mia ✅, leo')).toBeInTheDocument()

    await userEvent.selectOptions(screen.getByLabelText('Task status'), 'failed')
    expect(props.onStatusChange).toHaveBeenCalledWith(1, 'failed')
    await userEvent.click(screen.getByRole('button', { name: '✏️ Edit' }))
    expect(props.onEdit).toHaveBeenCalledWith(t)
    await userEvent.click(screen.getByRole('button', { name: '📜 Log' }))
    expect(props.onShowLog).toHaveBeenCalledWith(t)
    await userEvent.click(screen.getByRole('button', { name: 'Delete Tidy room' }))
    expect(props.onDelete).toHaveBeenCalledWith(t)
    expect(screen.queryByRole('button', { name: /Next kid/ })).not.toBeInTheDocument()
  })

  it('handles tasks without assignees, description or priority', () => {
    render(<TaskCard task={task({ assignments: [], description: null, priority: null, due_date: null })} {...parentProps()} />)
    expect(screen.getByText('👥 Nobody yet')).toBeInTheDocument()
    expect(screen.queryByText(/Due/)).not.toBeInTheDocument()
    expect(screen.queryByText(/⭐/)).not.toBeInTheDocument()
  })

  it('shows whose turn it is and lets the parent pass a rotating task on', async () => {
    const props = parentProps()
    render(<TaskCard task={rotatingTask()} {...props} />)
    expect(screen.getByText("🔄 Mia's turn")).toBeInTheDocument()
    expect(screen.getByText('👥 👉 Mia, leo')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '⏭️ Next kid' }))
    expect(props.onAdvance).toHaveBeenCalledWith(3)
  })

  it('says when everyone had a turn', () => {
    const done = rotatingTask({ assignments: [assignment(mia.id, { completed: true, is_active: false }), assignment(leo.id, { completed: true, is_active: false })] })
    render(<TaskCard task={done} {...parentProps()} />)
    expect(screen.getByText('🏁 Everyone had a turn')).toBeInTheDocument()
  })

  it('edits current and past occurrences of a recurring task', async () => {
    const props = parentProps()
    render(<TaskCard task={recurringTask()} {...props} />)
    expect(screen.getByText('Every day')).toBeInTheDocument()
    expect(screen.queryByLabelText('Task status')).not.toBeInTheDocument()

    await userEvent.selectOptions(screen.getByLabelText('Today status'), 'completed')
    expect(props.onOccurrenceStatusChange).toHaveBeenCalledWith(21, 'completed')

    const toggle = screen.getByRole('button', { name: '📆 History (1)' })
    await userEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    const history = screen.getByRole('list')
    await userEvent.selectOptions(within(history).getByRole('combobox'), 'failed')
    expect(props.onOccurrenceStatusChange).toHaveBeenCalledWith(20, 'failed')
    await userEvent.click(screen.getByRole('button', { name: '📆 Hide history' }))
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  it('shows the start date of a recurring task that has not started yet', () => {
    render(<TaskCard task={recurringTask({ occurrences: [], start_date: '2030-02-01T00:00:00Z' })} {...parentProps()} />)
    expect(screen.getByText(/Starts .*2030/)).toBeInTheDocument()
    expect(screen.getByText('To do')).toBeInTheDocument()
    expect(screen.queryByText('Today')).not.toBeInTheDocument()
  })
})

describe('TaskCard for kids', () => {
  it('lets a kid finish or start a one-time task', async () => {
    const props = childProps()
    render(<TaskCard task={task()} {...props} />)
    expect(screen.queryByText(/👥/)).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '✅ I did it!' }))
    expect(props.onComplete).toHaveBeenCalledWith(1)
    await userEvent.click(screen.getByRole('button', { name: "🚀 I'm on it" }))
    expect(props.onStart).toHaveBeenCalledWith(1)
  })

  it('hides "I\'m on it" once started and all buttons once the kid is done', () => {
    const { rerender } = render(<TaskCard task={task({ status: 'in_progress' })} {...childProps()} />)
    expect(screen.queryByRole('button', { name: "🚀 I'm on it" })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '✅ I did it!' })).toBeInTheDocument()

    const shared: Task = task({ status: 'in_progress', assignments: [assignment(mia.id, { completed: true }), assignment(leo.id)] })
    rerender(<TaskCard task={shared} {...childProps()} />)
    expect(screen.getByText('Done!')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('only lets the active kid finish a rotating task', () => {
    const { rerender } = render(<TaskCard task={rotatingTask()} {...childProps(mia.id)} />)
    expect(screen.getByText('🙌 Your turn!')).toBeInTheDocument()
    rerender(<TaskCard task={rotatingTask()} {...childProps(leo.id)} />)
    expect(screen.getByText('⏳ Not your turn yet')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '⏳ Not your turn' })).toBeDisabled()
  })

  it("completes today's occurrence and shows read-only history", async () => {
    const props = childProps()
    const { rerender } = render(<TaskCard task={recurringTask()} {...props} />)
    await userEvent.click(screen.getByRole('button', { name: '✅ I did it!' }))
    expect(props.onCompleteOccurrence).toHaveBeenCalledWith(21)
    await userEvent.click(screen.getByRole('button', { name: /History/ }))
    expect(within(screen.getByRole('list')).getByText('Done!')).toBeInTheDocument()

    const done = recurringTask({ occurrences: [occurrence(21, '2026-01-03T00:00:00Z', { status: 'completed' })] })
    rerender(<TaskCard task={done} {...props} />)
    expect(screen.getByText('All done, superstar! 🌟')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /History/ })).not.toBeInTheDocument()
  })
})
