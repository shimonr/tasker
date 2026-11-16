import {
  avatarFor,
  currentOccurrence,
  dayLabel,
  dueHint,
  formatDate,
  fromDateInput,
  groupTasks,
  homeFor,
  kidEmoji,
  nameFor,
  pendingApprovals,
  shiftDate,
  toDateInput,
  todayInput,
  userName,
} from './tasks'
import { assignment, leo, mia, occurrence, recurringTask, rotatingTask, task } from '../test/fixtures'

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

describe('family helpers', () => {
  it('uses the avatar a person picked, or a stable default', () => {
    expect(avatarFor({ id: 2, avatar: '🦄' })).toBe('🦄')
    expect(avatarFor({ id: 2, avatar: null })).toBe(kidEmoji(2))
  })

  it('shifts calendar dates across months and years', () => {
    expect(shiftDate('2026-01-31', 1)).toBe('2026-02-01')
    expect(shiftDate('2026-01-01', -7)).toBe('2025-12-25')
    expect(shiftDate('2026-11-16', 7)).toBe('2026-11-23')
  })

  it('labels calendar dates without timezone drift', () => {
    expect(dayLabel('2026-11-16', { month: 'short', day: 'numeric', timeZone: 'America/Los_Angeles' })).toMatch(/Nov 16/)
    expect(dayLabel('2026-11-16', { month: 'short', day: 'numeric' })).toMatch(/Nov 16/)
    expect(dayLabel('2026-01-03T00:00:00Z', { month: 'short', day: 'numeric' })).toMatch(/Jan 3/)
  })

  it('hints at overdue, due-today and due-tomorrow one-time tasks only', () => {
    expect(dueHint('2026-03-09T12:00:00Z', '2026-03-10')).toEqual({ tone: 'overdue', text: '😬 Overdue! Let’s get it done.' })
    expect(dueHint(fromDateInput('2026-03-10'), '2026-03-10')).toEqual({ tone: 'soon', text: '⏰ Due today!' })
    expect(dueHint(fromDateInput('2026-03-11'), '2026-03-10')).toEqual({ tone: 'soon', text: '⏰ Due tomorrow' })
    expect(dueHint(fromDateInput('2026-03-12'), '2026-03-10')).toBeNull()
    expect(dueHint(fromDateInput(todayInput()))?.tone).toBe('soon')
  })

  it('lists completions waiting for a grown-up, per assignment or per repeat', () => {
    const waiting = task({ id: 4, title: 'Feed fish', assignments: [assignment(mia.id, { awaiting_approval: true }), assignment(leo.id)] })
    const daily = recurringTask({
      id: 5,
      title: 'Brush teeth',
      occurrences: [
        occurrence(50, '2026-01-03T00:00:00Z', { awaiting_approval: true, completed_by: leo.id }),
        occurrence(49, '2026-01-02T00:00:00Z', { awaiting_approval: true, completed_by: null }),
        occurrence(48, '2026-01-01T00:00:00Z'),
      ],
    })
    expect(pendingApprovals([task(), waiting, daily], [mia, leo])).toEqual([
      { key: 'task-4-2', who: 'Mia', title: 'Feed fish', kind: 'task', taskId: 4, childId: mia.id },
      { key: 'occurrence-50', who: 'leo', title: 'Brush teeth', kind: 'occurrence', occurrenceId: 50, date: '2026-01-03T00:00:00Z' },
      { key: 'occurrence-49', who: 'A kid', title: 'Brush teeth', kind: 'occurrence', occurrenceId: 49, date: '2026-01-02T00:00:00Z' },
    ])
    expect(pendingApprovals([task()], [mia])).toEqual([])
  })
})
