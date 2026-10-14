import { currentOccurrence, formatDate, fromDateInput, groupTasks, homeFor, kidEmoji, nameFor, toDateInput, todayInput, userName } from './tasks'
import { leo, mia, recurringTask, rotatingTask, task } from '../test/fixtures'

describe('task helpers', () => {
  it('groups tasks into ordered, non-empty sections', () => {
    const weekly = recurringTask({ id: 5, recurrence: 'weekly' })
    const groups = groupTasks([rotatingTask(), weekly, task(), recurringTask()])
    expect(groups.map((g) => [g.title, g.tasks.map((t) => t.id)])).toEqual([
      ['One-time missions', [1]],
      ['Daily chores', [2]],
      ['Weekly chores', [5]],
      ['Taking turns', [3]],
    ])
    expect(groupTasks([])).toEqual([])
  })

  it('names users with sensible fallbacks', () => {
    expect(userName(mia)).toBe('Mia')
    expect(userName(leo)).toBe('leo')
    expect(userName({ email: 'x@example.com' })).toBe('x@example.com')
    expect(nameFor(leo.id, [mia, leo])).toBe('leo')
    expect(nameFor(42, [mia])).toBe('Kid #42')
  })

  it('round-trips date inputs through local noon so the day never shifts', () => {
    const iso = fromDateInput('2026-03-09')
    expect(new Date(iso).getHours()).toBe(12)
    expect(toDateInput(iso)).toBe('2026-03-09')
    expect(new Date(fromDateInput('2026-03-09', '00:00:00')).getHours()).toBe(0)
    expect(todayInput()).toBe(toDateInput(new Date().toISOString()))
  })

  it('has small display helpers', () => {
    expect(homeFor('child')).toBe('/child')
    expect(kidEmoji(2)).toBe(kidEmoji(10))
    expect(formatDate('2026-03-09T12:00:00Z')).toMatch(/2026/)
    expect(currentOccurrence(recurringTask())?.id).toBe(21)
    expect(currentOccurrence(task())).toBeUndefined()
  })
})
