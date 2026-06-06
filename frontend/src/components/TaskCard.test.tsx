import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TaskCard from './TaskCard'

describe('TaskCard', () => {
  const task = {
    id: 1,
    title: 'Do homework',
    description: 'Complete math problems',
    due_date: '2026-12-31T00:00:00.000Z',
    priority: 'High',
    recurrence: 'weekly',
    status: 'pending',
    created_by: 1,
    created_at: '2026-01-01T00:00:00.000Z',
    assignments: [{ id: 10, child_id: 2, completed: false, assigned_at: '2026-01-01T00:00:00.000Z' }],
  }

  it('renders task details and recurrence', () => {
    render(<TaskCard task={task} />)

    expect(screen.getByText('Do homework')).toBeInTheDocument()
    expect(screen.getByText('Complete math problems')).toBeInTheDocument()
    expect(screen.getByText('Repeats Weekly')).toBeInTheDocument()
    expect(screen.getByText('Priority: High')).toBeInTheDocument()
    expect(screen.getByText('1 assignee')).toBeInTheDocument()
  })

  it('shows complete button for child view pending ad-hoc task', async () => {
    const onComplete = vi.fn()
    const adHocTask = { ...task, recurrence: undefined }
    render(<TaskCard task={adHocTask} isChildView onComplete={onComplete} />)

    const button = screen.getByRole('button', { name: /mark completed/i })
    expect(button).toBeInTheDocument()

    await userEvent.click(button)
    expect(onComplete).toHaveBeenCalledWith(1)
  })
})
