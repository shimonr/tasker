import { useState } from 'react'
import type { Recurrence, Task, TaskStatus, User } from '../types'
import { PRIORITY, RECURRENCE, STATUS, STATUSES, TASK_TYPE, currentOccurrence, formatDate, nameFor } from '../lib/tasks'

interface ParentProps {
  viewer: 'parent'
  kids: User[]
  onStatusChange: (taskId: number, status: TaskStatus) => void
  onOccurrenceStatusChange: (occurrenceId: number, status: TaskStatus) => void
  onShowLog: (task: Task) => void
  onDelete: (task: Task) => void
  onEdit: (task: Task) => void
  onAdvance: (taskId: number) => void
}

interface ChildProps {
  viewer: 'child'
  childId: number
  onComplete: (taskId: number) => void
  onStart: (taskId: number) => void
  onCompleteOccurrence: (occurrenceId: number) => void
}

export type TaskCardProps = { task: Task } & (ParentProps | ChildProps)

export function StatusPill({ status }: { status: TaskStatus }) {
  const meta = STATUS[status]
  return (
    <span className={`chip shrink-0 ring-2 ${meta.className}`}>
      <span aria-hidden="true">{meta.emoji}</span> {meta.label}
    </span>
  )
}

function StatusSelect({ value, label, onChange, className = 'w-auto' }: { value: TaskStatus; label: string; onChange: (status: TaskStatus) => void; className?: string }) {
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value as TaskStatus)} className={`input py-2 text-sm font-semibold ${className}`}>
      {STATUSES.map((status) => (
        <option key={status} value={status}>
          {STATUS[status].emoji} {STATUS[status].label}
        </option>
      ))}
    </select>
  )
}

export default function TaskCard(props: TaskCardProps) {
  const { task } = props
  const [showHistory, setShowHistory] = useState(false)
  const type = TASK_TYPE[task.task_type]
  const recurring = task.task_type === 'recurring'
  const rotating = task.task_type === 'rotating'
  const recurrence = RECURRENCE[task.recurrence as Recurrence]
  const current = currentOccurrence(task)
  const active = task.assignments.find((a) => a.is_active && !a.completed)
  const priority = PRIORITY[task.priority ?? '']
  const mine = props.viewer === 'child' ? task.assignments.find((a) => a.child_id === props.childId) : undefined
  const status: TaskStatus = recurring ? current?.status ?? 'pending' : mine?.completed ? 'completed' : task.status
  const myTurn = !rotating || Boolean(mine?.is_active)

  return (
    <article className={`card flex flex-col gap-4 ${type.border}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className={`chip ${type.chip}`}>
            <span aria-hidden="true">{type.emoji}</span> {recurring ? recurrence.label : type.label}
          </span>
          <h3 className="mt-2 break-words text-xl text-grape-900 sm:text-2xl">{task.title}</h3>
        </div>
        <StatusPill status={status} />
      </div>

      {task.description && <p className="whitespace-pre-line break-words text-grape-700">{task.description}</p>}

      <div className="flex flex-wrap gap-2 text-sm">
        {task.due_date && !recurring && <span className="chip bg-sunny-100 text-grape-700">📅 Due {formatDate(task.due_date)}</span>}
        {recurring && !current && task.start_date && <span className="chip bg-sunny-100 text-grape-700">🚦 Starts {formatDate(task.start_date)}</span>}
        {priority && (
          <span className="chip bg-tangy-100 text-tangy-600" title={`${task.priority} priority`}>
            {priority.emoji} {'⭐'.repeat(priority.stars)}
          </span>
        )}
        {props.viewer === 'parent' && (
          <span className="chip bg-grape-50 text-grape-700">
            👥{' '}
            {task.assignments.length === 0
              ? 'Nobody yet'
              : task.assignments
                  .map((a) => `${rotating && a.is_active ? '👉 ' : ''}${nameFor(a.child_id, props.kids)}${a.completed ? ' ✅' : ''}`)
                  .join(', ')}
          </span>
        )}
      </div>

      {rotating && (
        <p className="rounded-2xl bg-grape-50 px-4 py-2 font-semibold text-grape-700">
          {props.viewer === 'child'
            ? myTurn
              ? '🙌 Your turn!'
              : '⏳ Not your turn yet'
            : active
              ? `🔄 ${nameFor(active.child_id, props.kids)}'s turn`
              : '🏁 Everyone had a turn'}
        </p>
      )}

      {recurring && current && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-ocean-50 px-4 py-3">
          <span className="font-bold text-ocean-600">{recurrence.current}</span>
          {props.viewer === 'child' ? (
            current.status === 'completed' ? (
              <span className="font-semibold text-leaf-600">All done, superstar! 🌟</span>
            ) : (
              <button type="button" className="btn-success" onClick={() => props.onCompleteOccurrence(current.id)}>
                ✅ I did it!
              </button>
            )
          ) : (
            <StatusSelect value={current.status} label={`${recurrence.current} status`} onChange={(s) => props.onOccurrenceStatusChange(current.id, s)} />
          )}
        </div>
      )}

      {recurring && task.occurrences.length > 1 && (
        <div>
          <button type="button" className="btn-ghost btn-sm" aria-expanded={showHistory} onClick={() => setShowHistory((v) => !v)}>
            📆 {showHistory ? 'Hide history' : `History (${task.occurrences.length - 1})`}
          </button>
          {showHistory && (
            <ul className="mt-3 grid gap-2">
              {task.occurrences.slice(1).map((occurrence) => (
                <li key={occurrence.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-grape-50/60 px-4 py-2">
                  <span className="font-semibold text-grape-700">{formatDate(occurrence.occurrence_date)}</span>
                  {props.viewer === 'parent' ? (
                    <StatusSelect
                      value={occurrence.status}
                      label={`Status for ${formatDate(occurrence.occurrence_date)}`}
                      onChange={(s) => props.onOccurrenceStatusChange(occurrence.id, s)}
                    />
                  ) : (
                    <StatusPill status={occurrence.status} />
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {props.viewer === 'child' && !recurring && status !== 'completed' && (
        <div className="flex flex-wrap gap-2">
          {myTurn ? (
            <>
              <button type="button" className="btn-success flex-1 sm:flex-none" onClick={() => props.onComplete(task.id)}>
                ✅ I did it!
              </button>
              {task.status === 'pending' && (
                <button type="button" className="btn-sunny flex-1 sm:flex-none" onClick={() => props.onStart(task.id)}>
                  🚀 I'm on it
                </button>
              )}
            </>
          ) : (
            <button type="button" className="btn-ghost" disabled>
              ⏳ Not your turn
            </button>
          )}
        </div>
      )}

      {props.viewer === 'parent' && (
        <div className="flex flex-wrap items-center gap-2 border-t-2 border-dashed border-grape-100 pt-4">
          {!recurring && (
            <StatusSelect value={task.status} label="Task status" className="w-full sm:w-auto" onChange={(s) => props.onStatusChange(task.id, s)} />
          )}
          <button type="button" className="btn-ghost btn-sm" onClick={() => props.onEdit(task)}>
            ✏️ Edit
          </button>
          <button type="button" className="btn-ghost btn-sm" onClick={() => props.onShowLog(task)}>
            📜 Log
          </button>
          {rotating && (
            <button type="button" className="btn-sunny btn-sm" onClick={() => props.onAdvance(task.id)}>
              ⏭️ Next kid
            </button>
          )}
          <button type="button" className="btn-ghost btn-sm ml-auto text-rose-500" aria-label={`Delete ${task.title}`} onClick={() => props.onDelete(task)}>
            🗑️
          </button>
        </div>
      )}
    </article>
  )
}
