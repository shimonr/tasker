import { useMemo, useState } from 'react'
import { Task } from '../types'

interface TaskCardProps {
  task: Task
  onComplete?: (taskId: number) => void
  onStatusChange?: (taskId: number, status: string) => void
  onShowLog?: (taskId: number) => void
  onDelete?: (taskId: number) => void
  isChildView?: boolean
}

const statusLabel: Record<string, string> = {
  pending: 'Pending',
  in_progress: 'In progress',
  failed: 'Failed',
  completed: 'Completed',
}

const statusStyles: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  in_progress: 'bg-sky-100 text-sky-700',
  failed: 'bg-rose-100 text-rose-700',
  completed: 'bg-emerald-100 text-emerald-700',
}

function formatRecurrenceLabel(recurrence?: string) {
  if (!recurrence) return null
  return recurrence.charAt(0).toUpperCase() + recurrence.slice(1)
}

function buildRecurrenceDates(task: Task) {
  const dates: { label: string; date: Date }[] = []
  const start = new Date(task.start_date || task.created_at)
  const today = new Date()
  let current = new Date(start)

  if (!task.recurrence) {
    return dates
  }

  while (current <= today) {
    dates.push({ label: current.toLocaleDateString(), date: new Date(current) })
    if (task.recurrence === 'daily') {
      current.setDate(current.getDate() + 1)
    } else if (task.recurrence === 'weekly') {
      current.setDate(current.getDate() + 7)
    } else if (task.recurrence === 'monthly') {
      current.setMonth(current.getMonth() + 1)
    } else if (task.recurrence === 'yearly') {
      current.setFullYear(current.getFullYear() + 1)
    }
  }

  return dates
}

export default function TaskCard({ task, onComplete, onStatusChange, onShowLog, onDelete, isChildView = false }: TaskCardProps) {
  const [showSchedule, setShowSchedule] = useState(false)
  const recurrenceDates = useMemo(() => buildRecurrenceDates(task), [task])
  const isRecurring = Boolean(task.recurrence)
  const scheduleStatuses = isChildView ? ['pending', 'in_progress', 'failed'] : ['pending', 'in_progress', 'failed', 'completed']

  return (
    <article className="rounded-[2rem] border border-kids-200 bg-gradient-to-br from-white via-kids-50 to-slate-50 p-5 shadow-lg shadow-kids-100">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">{task.title}</h2>
          <p className="mt-1 text-sm font-semibold text-kids-700">{isRecurring ? 'Recurring task' : 'Ad-hoc task'}</p>
          <p className="mt-3 text-slate-600">{task.description || 'No description provided.'}</p>
        </div>
        <div className="flex flex-col items-start gap-3 sm:items-end">
          {onDelete && (
            <button
              type="button"
              onClick={() => {
                if (window.confirm('Delete this task?')) {
                  onDelete(task.id)
                }
              }}
              className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
              aria-label="Delete task"
            >
              ×
            </button>
          )}
          <span className={`rounded-full px-3 py-1 text-sm font-medium ${statusStyles[task.status] || 'bg-slate-100 text-slate-700'}`}>
            {statusLabel[task.status] || task.status}
          </span>
          {isRecurring && (
            <button
              type="button"
              onClick={() => setShowSchedule((current) => !current)}
              className="rounded-2xl border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              {showSchedule ? 'Hide schedule' : 'View schedule'}
            </button>
          )}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-3 text-sm text-slate-600">
        {!isRecurring && task.due_date && <span>Due {new Date(task.due_date).toLocaleDateString()}</span>}
        {!isRecurring && task.start_date && <span>Starts {new Date(task.start_date).toLocaleDateString()}</span>}
        {task.priority && <span>Priority: {task.priority}</span>}
        {task.recurrence && <span>Repeats {formatRecurrenceLabel(task.recurrence)}</span>}
        <span>{task.assignments.length} assignee{task.assignments.length === 1 ? '' : 's'}</span>
      </div>

      {showSchedule && recurrenceDates.length > 0 && (
        <div className="mt-5 rounded-3xl bg-slate-50 p-4 text-sm text-slate-700">
          <p className="mb-3 font-semibold">Occurrence history</p>
          <div className="grid gap-3">
            {recurrenceDates.map((item) => (
              <div key={item.label} className="rounded-3xl bg-white p-4 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <span className="font-semibold text-slate-900">{item.label}</span>
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-xs uppercase tracking-[0.18em] text-slate-600">
                    {statusLabel[task.status] || task.status}
                  </span>
                </div>
                {onStatusChange && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {scheduleStatuses.map((nextStatus) => (
                      <button
                        key={nextStatus}
                        type="button"
                        onClick={() => onStatusChange(task.id, nextStatus)}
                        className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                      >
                        {statusLabel[nextStatus]}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-5 flex flex-wrap gap-3">
        {!isRecurring && isChildView && onComplete && task.status !== 'completed' && (
          <button
            onClick={() => onComplete(task.id)}
            className="inline-flex rounded-2xl bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-600"
          >
            Mark completed
          </button>
        )}
        {!isRecurring && onStatusChange && (
          <div className="flex flex-wrap gap-2">
            {['pending', 'in_progress', 'failed', ...(isChildView ? [] : ['completed'])].map((nextStatus) => (
              <button
                key={nextStatus}
                type="button"
                onClick={() => onStatusChange(task.id, nextStatus)}
                className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
              >
                {statusLabel[nextStatus]}
              </button>
            ))}
          </div>
        )}
        {onShowLog && (
          <button
            type="button"
            onClick={() => onShowLog(task.id)}
            className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
          >
            View log
          </button>
        )}
      </div>
    </article>
  )
}
