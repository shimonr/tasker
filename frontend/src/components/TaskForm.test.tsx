import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TaskForm from './TaskForm'
import { fromDateInput, toDateInput, todayInput } from '../lib/tasks'
import { assignment, leo, mia, recurringTask, rotatingTask, task } from '../test/fixtures'

const setup = (editing = null as Parameters<typeof TaskForm>[0]['editing'], kids = [mia, leo]) => {
  const onSubmit = vi.fn().mockResolvedValue(true)
  const onCancel = vi.fn()
  render(<TaskForm kids={kids} editing={editing} onSubmit={onSubmit} onCancel={onCancel} />)
  return { onSubmit, onCancel }
}

const future = () => toDateInput(new Date(Date.now() + 3 * 86400000).toISOString())

describe('TaskForm', () => {
  it('creates a one-time task', async () => {
    const { onSubmit } = setup()
    await userEvent.type(screen.getByLabelText('Task name'), 'Feed cat')
    await userEvent.type(screen.getByLabelText('Details (optional)'), 'Twice')
    await userEvent.type(screen.getByLabelText('Due date'), future())
    await userEvent.click(screen.getByLabelText('🔥 High'))
    await userEvent.click(screen.getByLabelText(/Mia/))
    await userEvent.click(screen.getByRole('button', { name: '✨ Create task' }))
    expect(onSubmit).toHaveBeenCalledWith({
      title: 'Feed cat',
      description: 'Twice',
      priority: 'High',
      task_type: 'adhoc',
      assignee_ids: [mia.id],
      due_date: fromDateInput(future()),
      start_date: undefined,
      recurrence: undefined,
    })
  })

  it('creates a weekly recurring task starting today by default', async () => {
    const { onSubmit } = setup()
    await userEvent.click(screen.getByLabelText(/Repeats/))
    expect(screen.queryByLabelText('Due date')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Starting on')).toHaveValue(todayInput())
    await userEvent.type(screen.getByLabelText('Task name'), 'Laundry')
    await userEvent.click(screen.getByLabelText('Every week'))
    await userEvent.click(screen.getByLabelText(/leo/))
    await userEvent.click(screen.getByRole('button', { name: '✨ Create task' }))
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      task_type: 'recurring',
      recurrence: 'weekly',
      start_date: fromDateInput(todayInput(), '00:00:00'),
      due_date: undefined,
      priority: 'Medium',
    })
    await userEvent.clear(screen.getByLabelText('Starting on'))
    await userEvent.type(screen.getByLabelText('Starting on'), '2030-02-03')
    await userEvent.click(screen.getByRole('button', { name: '✨ Create task' }))
    expect(onSubmit.mock.calls[1][0]).toMatchObject({
      start_date: fromDateInput('2030-02-03', '00:00:00'),
      due_date: undefined,
      priority: 'Medium',
    })
  })

  it('validates kids, turns and past due dates', async () => {
    const { onSubmit } = setup()
    await userEvent.type(screen.getByLabelText('Task name'), 'X')
    await userEvent.type(screen.getByLabelText('Due date'), '2020-01-01')
    await userEvent.click(screen.getByRole('button', { name: '✨ Create task' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Pick at least one kid')

    await userEvent.click(screen.getByLabelText(/Mia/))
    await userEvent.click(screen.getByRole('button', { name: '✨ Create task' }))
    expect(screen.getByRole('alert')).toHaveTextContent("can't be in the past")

    await userEvent.click(screen.getByLabelText(/Taking turns/))
    await userEvent.click(screen.getByRole('button', { name: '✨ Create task' }))
    expect(screen.getByRole('alert')).toHaveTextContent('at least 2 kids')

    await userEvent.click(screen.getByLabelText(/leo/))
    await userEvent.click(screen.getByLabelText(/leo/)) // toggling off again
    await userEvent.click(screen.getByLabelText(/leo/))
    await userEvent.click(screen.getByRole('button', { name: '✨ Create task' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ task_type: 'rotating', assignee_ids: [mia.id, leo.id], due_date: undefined })
  })

  it('prefills when editing and keeps an overdue date that was not changed', async () => {
    const overdue = task({ due_date: '2020-01-01T12:00:00Z', assignments: [assignment(leo.id)] })
    const { onSubmit, onCancel } = setup(overdue)
    expect(screen.getByLabelText('Task name')).toHaveValue('Tidy room')
    expect(screen.getByLabelText(/One-time/)).toBeDisabled()
    expect(screen.getByLabelText(/leo/)).toBeChecked()
    await userEvent.click(screen.getByRole('button', { name: '💾 Save changes' }))
    expect(onSubmit).toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalled()
  })

  it('prefills recurring and rotating tasks', () => {
    setup(recurringTask({ description: null, priority: null, recurrence: 'monthly' }))
    expect(screen.getByLabelText('Every month')).toBeChecked()
    expect(screen.getByLabelText('Starting on')).toHaveValue(toDateInput('2026-01-01T00:00:00Z'))
    expect(screen.getByLabelText('Details (optional)')).toHaveValue('')
    expect(screen.getByLabelText('🌟 Medium')).toBeChecked()
  })

  it('prefills a rotating task without dates', () => {
    setup(rotatingTask({ start_date: null }))
    expect(screen.getByLabelText(/Taking turns/)).toBeChecked()
  })

  it('explains when there are no kid accounts', () => {
    setup(null, [])
    expect(screen.getByText(/No kid accounts yet/)).toBeInTheDocument()
  })
})
