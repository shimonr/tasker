import { Task } from '../types'

interface TaskCardProps {
  task: Task
  onComplete?: (taskId: number) => void
  isChildView?: boolean
}

export default function TaskCard({ task, onComplete, isChildView = false }: TaskCardProps) {
  return (
    <article className="rounded-[2rem] border border-kids-200 bg-gradient-to-br from-white via-kids-50 to-slate-50 p-5 shadow-lg shadow-kids-100">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">{task.title}</h2>
          <p className="mt-1 text-sm font-semibold text-kids-700">Task for you!</p>
          <p className="mt-1 text-slate-600">{task.description || 'No description provided.'}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-sm font-medium ${task.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
          {task.status}
        </span>
      </div>
      <div className="mt-4 flex flex-wrap gap-3 text-sm text-slate-600">
        {task.due_date && <span>Due {new Date(task.due_date).toLocaleDateString()}</span>}
        {task.priority && <span>Priority: {task.priority}</span>}
        {task.recurrence && <span>Repeats {task.recurrence}</span>}
        <span>{task.assignments.length} assignee{task.assignments.length === 1 ? '' : 's'}</span>
      </div>
      {isChildView && task.status === 'pending' && onComplete && (
        <button
          onClick={() => onComplete(task.id)}
          className="mt-5 inline-flex rounded-2xl bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-600"
        >
          Mark completed
        </button>
      )}
    </article>
  )
}
