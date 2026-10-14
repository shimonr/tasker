import type { Occurrence, Recurrence, Task, TaskStatus, TaskType, User, UserRole } from '../types'

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

export const todayInput = () => toDateInput(new Date().toISOString())
