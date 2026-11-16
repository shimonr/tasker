import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { fetchWeek } from '../api'
import WeekChart from './WeekChart'
import type { WeekView } from '../types'

vi.mock('../api', () => ({ fetchWeek: vi.fn() }))

const weekFrom = (start: string): WeekView => {
  const days = Array.from({ length: 7 }, (_, i) => ({
    date: new Date(Date.parse(`${start}T00:00:00Z`) + i * 86400000).toISOString().slice(0, 10),
    items: [] as WeekView['days'][number]['items'],
  }))
  return { start, days }
}

const sampleWeek = (): WeekView => {
  const week = weekFrom('2026-11-16')
  week.days[0].items = [
    { task_id: 1, occurrence_id: null, title: 'Tidy room', child_id: 2, child_name: 'Mia', status: 'pending', awaiting_approval: false },
    { task_id: 2, occurrence_id: 21, title: 'Brush teeth', child_id: 3, child_name: 'leo', status: 'completed', awaiting_approval: true },
  ]
  return week
}

describe('WeekChart', () => {
  beforeEach(() => {
    vi.mocked(fetchWeek).mockImplementation(async (start) => (start === undefined ? sampleWeek() : weekFrom(start)))
  })

  it('shows seven day columns with each item, its status and whether it awaits a yes', async () => {
    render(<WeekChart version={0} />)
    expect(screen.getByText('Loading the week…')).toBeInTheDocument()
    expect(await screen.findByText(/Nov 16 – .*Nov 22/)).toBeInTheDocument()
    const columns = screen.getAllByRole('listitem').filter((li) => li.querySelector('h3'))
    expect(columns).toHaveLength(7)
    expect(columns[0]).toHaveTextContent('Mon, Nov 16')
    expect(within(columns[0]).getByText('Tidy room')).toBeInTheDocument()
    expect(within(columns[0]).getByText('Mia')).toBeInTheDocument()
    expect(within(columns[0]).getByText('To do')).toBeInTheDocument()
    expect(within(columns[0]).getByText('Done!')).toBeInTheDocument()
    expect(within(columns[0]).getByText('⏳ Needs a yes')).toBeInTheDocument()
    expect(columns.slice(1).filter((c) => c.textContent?.includes('Free day'))).toHaveLength(6)
  })

  it('moves to the previous and next weeks', async () => {
    render(<WeekChart version={0} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Next week ▶' }))
    expect(fetchWeek).toHaveBeenLastCalledWith('2026-11-23')
    expect(await screen.findByText(/Nov 23 – /)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '◀ Last week' }))
    expect(fetchWeek).toHaveBeenLastCalledWith('2026-11-16')
    expect(await screen.findByText(/Nov 16 – /)).toBeInTheDocument()
  })

  it('reloads the same week when the parent data changes', async () => {
    const { rerender } = render(<WeekChart version={0} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Next week ▶' }))
    expect(fetchWeek).toHaveBeenCalledTimes(2)
    rerender(<WeekChart version={1} />)
    expect(fetchWeek).toHaveBeenCalledTimes(3)
    expect(fetchWeek).toHaveBeenLastCalledWith('2026-11-23')
  })

  it('opens the browser print dialog from the print button', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {})
    render(<WeekChart version={0} />)
    await userEvent.click(await screen.findByRole('button', { name: '🖨️ Print' }))
    expect(print).toHaveBeenCalled()
    print.mockRestore()
  })

  it('explains when the week cannot be loaded', async () => {
    vi.mocked(fetchWeek).mockRejectedValue(new Error("Can't reach the server. Check your connection and try again."))
    render(<WeekChart version={0} />)
    expect(await screen.findByRole('alert')).toHaveTextContent("Can't reach the server")
    expect(screen.queryByText('Loading the week…')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Next week ▶' })).not.toBeInTheDocument()
  })
})
