import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Approvals from './Approvals'
import type { PendingApproval } from '../lib/tasks'

const items: PendingApproval[] = [
  { key: 'task-1-2', who: 'Mia', title: 'Tidy room', kind: 'task', taskId: 1, childId: 2 },
  { key: 'occurrence-21', who: 'leo', title: 'Brush teeth', kind: 'occurrence', occurrenceId: 21, date: '2026-01-03T00:00:00Z' },
]

describe('Approvals', () => {
  it('renders nothing when no completions are waiting', () => {
    const { container } = render(<Approvals items={[]} onDecide={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('lists each waiting completion and lets a parent approve or reject it', async () => {
    const onDecide = vi.fn()
    render(<Approvals items={items} onDecide={onDecide} />)
    expect(screen.getByRole('heading', { name: /Waiting for your yes \(2\)/ })).toBeInTheDocument()
    const [first, second] = screen.getAllByRole('listitem')
    expect(first).toHaveTextContent('Mia says “Tidy room” is done')
    expect(second).toHaveTextContent('leo says “Brush teeth” is done')
    expect(second).toHaveTextContent(/Jan/)

    await userEvent.click(within(first).getByRole('button', { name: '✅ Approve' }))
    expect(onDecide).toHaveBeenLastCalledWith(items[0], true)
    await userEvent.click(within(second).getByRole('button', { name: '✖️ Reject' }))
    expect(onDecide).toHaveBeenLastCalledWith(items[1], false)
  })
})
