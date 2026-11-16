import type { Occurrence, Recurrence, Task, TaskStatus, TaskType, User, UserRole } from '../types'

const DAY_MS = 86400000

export const STATUS: Record<TaskStatus, { label: string; emoji: string; className: string }> = {
  pending: { label: 'To do', emoji: '⏳', className: 'bg-sunny-100 text-sunny-500 ring-sunny-200' },
  in_progress: { label: 'Working on it', emoji: '🚀', className: 'bg-ocean-100 text-ocean-600 ring-ocean-200' },
  failed: { label: 'Missed', emoji: '😕', className: 'bg-rose-100 text-rose-600 ring-rose-200' },
  completed: { label: 'Done!', emoji: '🎉', className: 'bg-leaf-100 text-leaf-600 ring-leaf-200' },
}

export const STATUSES = Object.keys(STATUS) as TaskStatus[]

export const TASK_TYPE: Record<TaskType, { label: string; emoji: string; border: string; chip: string }> = {
  adhoc: { label: 'One-time', emoji: '🎯', border: 'border-bubble-200', chip: 'bg-bubble-100 text-bubble-600' },
  recurring: { label: 'Repeats', emoji: '🔁', border: 'border-ocean-200', chip: 'bg-ocean-100 text-ocean-600' },
  rotating: { label: 'Taking turns', emoji: '🔄', border: 'border-grape-200', chip: 'bg-grape-100 text-grape-700' },
}

export const RECURRENCE: Record<Recurrence, { label: string; current: string; section: string; emoji: string }> = {
  daily: { label: 'Every day', current: 'Today', section: 'Daily chores', emoji: '☀️' },
  weekly: { label: 'Every week', current: 'This week', section: 'Weekly chores', emoji: '📅' },
  monthly: { label: 'Every month', current: 'This month', section: 'Monthly chores', emoji: '🗓️' },
  yearly: { label: 'Every year', current: 'This year', section: 'Yearly chores', emoji: '🎂' },
}

export const PRIORITY: Record<string, { emoji: string; stars: number }> = {
  Low: { emoji: '🌱', stars: 1 },
  Medium: { emoji: '🌟', stars: 2 },
  High: { emoji: '🔥', stars: 3 },
}

const SECTIONS: { key: string; title: string; emoji: string; matches: (task: Task) => boolean }[] = [
  { key: 'adhoc', title: 'One-time missions', emoji: '🎯', matches: (t) => t.task_type === 'adhoc' },
  ...(Object.keys(RECURRENCE) as Recurrence[]).map((recurrence) => ({
    key: recurrence,
    title: RECURRENCE[recurrence].section,
    emoji: RECURRENCE[recurrence].emoji,
    matches: (t: Task) => t.task_type === 'recurring' && t.recurrence === recurrence,
  })),
  { key: 'rotating', title: 'Taking turns', emoji: '🔄', matches: (t) => t.task_type === 'rotating' },
]

/** Group tasks into display sections, leaving out empty ones. */
export const groupTasks = (tasks: Task[]) =>
  SECTIONS.map(({ matches, ...section }) => ({ ...section, tasks: tasks.filter(matches) })).filter((s) => s.tasks.length > 0)

/** The backend returns occurrences newest first; the first one is the current period. */
export const currentOccurrence = (task: Task): Occurrence | undefined => task.occurrences[0]

export const userName = (user: Pick<User, 'full_name' | 'username' | 'email'>) => user.full_name || user.username || user.email

export const nameFor = (userId: number, users: User[]) => {
  const user = users.find((u) => u.id === userId)
  return user ? userName(user) : `Kid #${userId}`
}

export const homeFor = (role: UserRole) => `/${role}`

export const formatDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })

const pad = (n: number) => String(n).padStart(2, '0')

/** ISO timestamp -> local yyyy-mm-dd for <input type="date">. */
export const toDateInput = (iso: string) => {
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** yyyy-mm-dd -> ISO timestamp at a local time (noon by default, so the calendar day survives any timezone). */
export const fromDateInput = (value: string, time = '12:00:00') => new Date(`${value}T${time}`).toISOString()

const KID_EMOJI = ['🦊', '🐼', '🐸', '🦁', '🐯', '🐨', '🐙', '🦄']

export const kidEmoji = (id: number) => KID_EMOJI[id % KID_EMOJI.length]

export const DEFAULT_COLOR = '#ff4fa0'

/** The emoji a person chose for themselves, or a stable default. */
export const avatarFor = (user: Pick<User, 'id' | 'avatar'>) => user.avatar || kidEmoji(user.id)

export const todayInput = () => toDateInput(new Date().toISOString())

/** Shifts a yyyy-mm-dd calendar date by whole days (calendar maths in UTC, so no timezone drift). */
export const shiftDate = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10)

/** Formats a calendar day (yyyy-mm-dd, or the UTC day of an ISO timestamp) without shifting it into the viewer's timezone. */
export const dayLabel = (date: string, options: Intl.DateTimeFormatOptions) =>
  new Date(`${date.slice(0, 10)}T12:00:00Z`).toLocaleDateString(undefined, { ...options, timeZone: 'UTC' })

/** A friendly nudge on a child's card when a one-time task is due today, tomorrow or already late. */
export const dueHint = (due: string, today = todayInput()): { tone: 'overdue' | 'soon'; text: string } | null => {
  const days = Math.round((Date.parse(`${toDateInput(due)}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY_MS)
  if (days < 0) return { tone: 'overdue', text: '😬 Overdue! Let’s get it done.' }
  if (days === 0) return { tone: 'soon', text: '⏰ Due today!' }
  if (days === 1) return { tone: 'soon', text: '⏰ Due tomorrow' }
  return null
}

interface PendingBase {
  key: string
  who: string
  title: string
}

export type PendingApproval =
  | (PendingBase & { kind: 'task'; taskId: number; childId: number })
  | (PendingBase & { kind: 'occurrence'; occurrenceId: number; date: string })

/** Completions that a child finished and a parent still has to approve or reject. */
export const pendingApprovals = (tasks: Task[], kids: User[]): PendingApproval[] =>
  tasks.flatMap((task): PendingApproval[] =>
    task.task_type === 'recurring'
      ? task.occurrences
          .filter((o) => o.awaiting_approval)
          .map((o) => ({
            kind: 'occurrence',
            key: `occurrence-${o.id}`,
            who: o.completed_by ? nameFor(o.completed_by, kids) : 'A kid',
            title: task.title,
            occurrenceId: o.id,
            date: o.occurrence_date,
          }))
      : task.assignments
          .filter((a) => a.awaiting_approval)
          .map((a) => ({
            kind: 'task',
            key: `task-${task.id}-${a.child_id}`,
            who: nameFor(a.child_id, kids),
            title: task.title,
            taskId: task.id,
            childId: a.child_id,
          })),
  )
