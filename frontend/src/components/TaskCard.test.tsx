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
    task_type: 'recurring' as const,
    status: 'pending',
    created_by: 1,
    created_at: '2026-01-01T00:00:00.000Z',
    assignments: [{ id: 10, child_id: 2, completed: false, assigned_at: '2026-01-01T00:00:00.000Z', is_active: true }],
    occurrences: [],
  }

  it('renders task details and recurrence', () => {
    render(<TaskCard task={task} />)

    expect(screen.getByText('Do homework')).toBeInTheDocument()
    expect(screen.getByText('Complete math problems')).toBeInTheDocument()
    expect(screen.getByText('Repeats Weekly')).toBeInTheDocument()
    expect(screen.getByText('Priority: High')).toBeInTheDocument()
    expect(screen.getByText(/Assigned:.*Child #2/)).toBeInTheDocument()
  })

  it('shows complete button for child view pending ad-hoc task', async () => {
    const onComplete = vi.fn()
    const adHocTask = { ...task, recurrence: undefined, task_type: 'adhoc' as const, occurrences: [] }
    render(<TaskCard task={adHocTask} isChildView onComplete={onComplete} />)

    const button = screen.getByRole('button', { name: /mark completed/i })
    expect(button).toBeInTheDocument()

    await userEvent.click(button)
    expect(onComplete).toHaveBeenCalledWith(1)
  })

  it('hides task type label in child view', () => {
    const adHocTask = { ...task, recurrence: undefined, task_type: 'adhoc' as const, occurrences: [] }
    render(<TaskCard task={adHocTask} isChildView childId={2} />)

    expect(screen.queryByText('Ad-hoc task')).not.toBeInTheDocument()
  })

  it('hides assignee count in child view', () => {
    const adHocTask = { ...task, recurrence: undefined, task_type: 'adhoc' as const, occurrences: [] }
    render(<TaskCard task={adHocTask} isChildView childId={2} />)

    expect(screen.queryByText('1 assignee')).not.toBeInTheDocument()
  })

  it('shows active label for rotating task in child view', () => {
    const rotatingTask = {
      ...task,
      task_type: 'rotating' as const,
      recurrence: undefined,
      occurrences: [],
      assignments: [
        { id: 10, child_id: 2, completed: false, assigned_at: '2026-01-01T00:00:00.000Z', is_active: true, rotation_order: 0 },
        { id: 11, child_id: 3, completed: false, assigned_at: '2026-01-01T00:00:00.000Z', is_active: false, rotation_order: 1 },
      ],
    }
    render(<TaskCard task={rotatingTask} isChildView childId={2} />)

    expect(screen.getByText('Active')).toBeInTheDocument()
    expect(screen.queryByText('Active for child')).not.toBeInTheDocument()
  })

  it('shows child name for rotating task in parent view', () => {
    const children = [
      { id: 2, email: 'child1@test.com', role: 'child' as const, created_at: '2026-01-01', full_name: 'Alice' },
      { id: 3, email: 'child2@test.com', role: 'child' as const, created_at: '2026-01-01', full_name: 'Bob' },
    ]
    const rotatingTask = {
      ...task,
      task_type: 'rotating' as const,
      recurrence: undefined,
      occurrences: [],
      assignments: [
        { id: 10, child_id: 2, completed: false, assigned_at: '2026-01-01T00:00:00.000Z', is_active: true, rotation_order: 0 },
        { id: 11, child_id: 3, completed: false, assigned_at: '2026-01-01T00:00:00.000Z', is_active: false, rotation_order: 1 },
      ],
    }
    render(<TaskCard task={rotatingTask} children={children} />)

    expect(screen.getByText(/Alice.*active/)).toBeInTheDocument()
    expect(screen.getByText(/Assigned.*Alice.*Bob/)).toBeInTheDocument()
  })

  it('shows edit button when onEdit is provided', () => {
    const onEdit = vi.fn()
    render(<TaskCard task={task} onEdit={onEdit} />)

    expect(screen.getByText('Edit')).toBeInTheDocument()
  })

  it('disables complete button for inactive rotating assignment in child view', () => {
    const onComplete = vi.fn()
    const rotatingTask = {
      ...task,
      task_type: 'rotating' as const,
      recurrence: undefined,
      occurrences: [],
      assignments: [
        { id: 10, child_id: 3, completed: false, assigned_at: '2026-01-01T00:00:00.000Z', is_active: true, rotation_order: 0 },
        { id: 11, child_id: 2, completed: false, assigned_at: '2026-01-01T00:00:00.000Z', is_active: false, rotation_order: 1 },
      ],
    }
    render(<TaskCard task={rotatingTask} isChildView childId={2} onComplete={onComplete} />)

    const button = screen.getByRole('button', { name: /not your turn/i })
    expect(button).toBeDisabled()
  })
})
