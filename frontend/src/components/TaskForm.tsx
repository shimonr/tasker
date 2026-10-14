import { FormEvent, useState } from 'react'
import type { Priority, Recurrence, Task, TaskInput, TaskType, User } from '../types'
import { PRIORITY, RECURRENCE, TASK_TYPE, fromDateInput, kidEmoji, toDateInput, todayInput, userName } from '../lib/tasks'

interface TaskFormProps {
  kids: User[]
  editing: Task | null
  onSubmit: (input: TaskInput) => Promise<unknown>
  onCancel: () => void
}

/** Create or edit a task. Remount with a new `key` to reset it for a different task. */
export default function TaskForm({ kids, editing, onSubmit, onCancel }: TaskFormProps) {
  const initialDue = editing?.due_date ? toDateInput(editing.due_date) : ''
  const [taskType, setTaskType] = useState<TaskType>(editing?.task_type ?? 'adhoc')
  const [title, setTitle] = useState(editing?.title ?? '')
  const [description, setDescription] = useState(editing?.description ?? '')
  const [dueDate, setDueDate] = useState(initialDue)
  const [startDate, setStartDate] = useState(editing?.start_date ? toDateInput(editing.start_date) : todayInput())
  const [recurrence, setRecurrence] = useState<Recurrence>(editing?.recurrence ?? 'daily')
  const [priority, setPriority] = useState<Priority>((editing?.priority as Priority) ?? 'Medium')
  const [childIds, setChildIds] = useState<number[]>(editing?.assignments.map((a) => a.child_id) ?? [])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const toggleChild = (id: number) => setChildIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))

  const validate = () => {
    if (childIds.length === 0) return 'Pick at least one kid for this task.'
    if (taskType === 'rotating' && childIds.length < 2) return 'Taking-turns tasks need at least 2 kids.'
    if (taskType === 'adhoc' && dueDate < todayInput() && dueDate !== initialDue) return "The due date can't be in the past."
    return ''
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const problem = validate()
    setError(problem)
    if (problem) return
    setSaving(true)
    await onSubmit({
      title,
      description,
      priority,
      task_type: taskType,
      assignee_ids: childIds,
      due_date: taskType === 'adhoc' ? fromDateInput(dueDate) : undefined,
      start_date: taskType === 'recurring' ? fromDateInput(startDate, '00:00:00') : undefined,
      recurrence: taskType === 'recurring' ? recurrence : undefined,
    })
    setSaving(false)
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit} aria-label={editing ? 'Edit task' : 'New task'}>
      <fieldset>
        <legend className="label">What kind of task?</legend>
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(TASK_TYPE) as TaskType[]).map((type) => (
            <label key={type} className="choice flex-col text-sm sm:flex-row sm:text-base">
              <input
                type="radio"
                name="task-type"
                className="sr-only"
                checked={taskType === type}
                onChange={() => setTaskType(type)}
                disabled={Boolean(editing)}
              />
              <span className="text-2xl" aria-hidden="true">
                {TASK_TYPE[type].emoji}
              </span>
              {TASK_TYPE[type].label}
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <label className="label" htmlFor="task-title">
          Task name
        </label>
        <input id="task-title" required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Feed the cat 🐱" className="input" />
      </div>
      <div>
        <label className="label" htmlFor="task-description">
          Details (optional)
        </label>
        <textarea id="task-description" maxLength={2000} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} className="input" />
      </div>

      {taskType === 'adhoc' && (
        <div>
          <label className="label" htmlFor="task-due">
            Due date
          </label>
          <input id="task-due" type="date" required value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="input" />
        </div>
      )}

      {taskType === 'recurring' && (
        <div className="grid gap-4 sm:grid-cols-2">
          <fieldset>
            <legend className="label">How often?</legend>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(RECURRENCE) as Recurrence[]).map((value) => (
                <label key={value} className="choice text-sm">
                  <input type="radio" name="recurrence" className="sr-only" checked={recurrence === value} onChange={() => setRecurrence(value)} />
                  {RECURRENCE[value].label}
                </label>
              ))}
            </div>
          </fieldset>
          <div>
            <label className="label" htmlFor="task-start">
              Starting on
            </label>
            <input id="task-start" type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} className="input" />
          </div>
        </div>
      )}

      <fieldset>
        <legend className="label">How important?</legend>
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(PRIORITY) as Priority[]).map((value) => (
            <label key={value} className="choice text-sm">
              <input type="radio" name="priority" className="sr-only" checked={priority === value} onChange={() => setPriority(value)} />
              {PRIORITY[value].emoji} {value}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="label">Who's doing it?</legend>
        {kids.length === 0 ? (
          <p className="rounded-2xl bg-grape-50 px-4 py-3 text-grape-700">No kid accounts yet. Ask your admin to add some!</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {kids.map((kid) => (
              <label key={kid.id} className="choice">
                <input type="checkbox" className="sr-only" checked={childIds.includes(kid.id)} onChange={() => toggleChild(kid.id)} />
                <span aria-hidden="true">{kidEmoji(kid.id)}</span> {userName(kid)}
              </label>
            ))}
          </div>
        )}
      </fieldset>

      {error && (
        <p role="alert" className="rounded-2xl bg-rose-50 px-4 py-2 font-semibold text-rose-600">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <button type="submit" disabled={saving} className="btn-primary flex-1">
          {editing ? '💾 Save changes' : '✨ Create task'}
        </button>
        <button type="button" onClick={onCancel} className="btn-ghost">
          Cancel
        </button>
      </div>
    </form>
  )
}
