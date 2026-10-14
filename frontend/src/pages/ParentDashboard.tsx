import { useCallback, useEffect, useRef, useState } from 'react'
import {
  advanceTask,
  createTask,
  deleteTask,
  fetchChildren,
  fetchParentTasks,
  fetchStats,
  fetchTaskLogs,
  updateOccurrenceStatus,
  updateTask,
  updateTaskStatus,
} from '../api'
import type { ParentStats, StatusLog, Task, TaskInput, TaskStatus, User } from '../types'
import Modal from '../components/Modal'
import Navbar from '../components/Navbar'
import TaskCard, { StatusPill } from '../components/TaskCard'
import TaskForm from '../components/TaskForm'
import TaskSections from '../components/TaskSections'
import { useToast } from '../components/Toast'
import { kidEmoji, nameFor, userName } from '../lib/tasks'

interface ParentDashboardProps {
  user: User
  onLogout: () => void
}

const TILES: { key: keyof Omit<ParentStats, 'children'>; label: string; emoji: string; className: string }[] = [
  { key: 'total_tasks', label: 'All tasks', emoji: '📋', className: 'bg-grape-500 border-grape-700 text-white' },
  { key: 'completed_tasks', label: 'Done', emoji: '🎉', className: 'bg-leaf-400 border-leaf-600 text-white' },
  { key: 'in_progress_tasks', label: 'Working', emoji: '🚀', className: 'bg-ocean-400 border-ocean-600 text-white' },
  { key: 'pending_tasks', label: 'To do', emoji: '⏳', className: 'bg-sunny-300 border-sunny-500 text-grape-900' },
  { key: 'failed_tasks', label: 'Missed', emoji: '😕', className: 'bg-bubble-400 border-bubble-600 text-white' },
]
const MEDALS = ['🥇', '🥈', '🥉']

export default function ParentDashboard({ user, onLogout }: ParentDashboardProps) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [kids, setKids] = useState<User[]>([])
  const [stats, setStats] = useState<ParentStats | null>(null)
  const [filter, setFilter] = useState<number | 'all'>('all')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Task | null>(null)
  const [log, setLog] = useState<{ task: Task; entries: StatusLog[] } | null>(null)
  const [deleting, setDeleting] = useState<Task | null>(null)
  const formRef = useRef<HTMLDivElement>(null)
  const { toast, attempt } = useToast()
  const cancelDelete = () => setDeleting(null)

  const load = useCallback(async () => {
    const [nextTasks, nextStats, nextKids] = await Promise.all([fetchParentTasks(), fetchStats(), fetchChildren()])
    setTasks(nextTasks)
    setStats(nextStats)
    setKids(nextKids)
  }, [])

  useEffect(() => {
    attempt(load)
  }, [attempt, load])

  useEffect(() => {
    if (formOpen) formRef.current!.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [formOpen, editing])

  const closeForm = () => {
    setFormOpen(false)
    setEditing(null)
  }

  const saveTask = (input: TaskInput) =>
    attempt(
      async () => {
        await (editing ? updateTask(editing.id, input) : createTask(input))
        closeForm()
        await load()
      },
      editing ? 'Task updated!' : 'Task created!',
    )

  const refreshAfter = (action: () => Promise<unknown>, success?: string) => attempt(() => action().then(load), success)

  const changedBy = (userId: number) => (userId === user.id ? userName(user) : nameFor(userId, kids))
  const visible = filter === 'all' ? tasks : tasks.filter((task) => task.assignments.some((a) => a.child_id === filter))

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16">
      <Navbar user={user} onLogout={onLogout} />
      {toast}

      <section className="mb-6 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="card border-grape-100">
          <h1 className="text-3xl text-grape-900">Hello, {userName(user).split(' ')[0]}! 🌈</h1>
          <p className="mt-1 text-grape-700">Here's how the family adventure is going.</p>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {TILES.map((tile) => (
              <div key={tile.key} className={`rounded-3xl border-b-4 px-3 py-3 text-center first:col-span-2 sm:first:col-span-1 ${tile.className}`}>
                <div className="text-2xl" aria-hidden="true">
                  {tile.emoji}
                </div>
                <div className="text-2xl font-bold">{stats ? stats[tile.key] : 0}</div>
                <div className="text-xs font-semibold uppercase tracking-wide">{tile.label}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="card border-sunny-200">
          <h2 className="text-2xl text-grape-900">⭐ Star champions</h2>
          {stats && stats.children.length > 0 ? (
            <ol className="mt-3 space-y-2">
              {stats.children.map((entry, index) => (
                <li key={entry.child_id} className="flex items-center gap-3 rounded-2xl bg-sunny-50 px-3 py-2">
                  <span className="w-8 text-center text-2xl" aria-hidden="true">
                    {MEDALS[index] ?? kidEmoji(entry.child_id)}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-semibold">{entry.name}</span>
                  <span className="chip bg-sunny-200 text-grape-900">⭐ {entry.stars}</span>
                  <span className="chip bg-tangy-100 text-tangy-600" title="Day streak">
                    🔥 {entry.streak_days}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-3 text-grape-700">Stars appear here as kids finish their tasks.</p>
          )}
        </div>
      </section>

      <div ref={formRef} className="mb-6 scroll-mt-24">
        {formOpen ? (
          <section className="card border-bubble-200">
            <h2 className="mb-4 text-2xl text-grape-900">{editing ? '✏️ Edit task' : '✨ New task'}</h2>
            <TaskForm key={editing?.id ?? 'new'} kids={kids} editing={editing} onSubmit={saveTask} onCancel={closeForm} />
          </section>
        ) : (
          <button type="button" className="btn-pink w-full text-lg sm:w-auto" onClick={() => setFormOpen(true)}>
            ➕ New task
          </button>
        )}
      </div>

      <nav aria-label="Filter by kid" className="-mx-4 mb-6 flex gap-2 overflow-x-auto px-4 pb-2">
        {[{ id: 'all' as const, label: '🌈 Everyone' }, ...kids.map((kid) => ({ id: kid.id, label: `${kidEmoji(kid.id)} ${userName(kid)}` }))].map(
          (option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={filter === option.id}
              onClick={() => setFilter(option.id)}
              className={`${filter === option.id ? 'btn-primary' : 'btn-ghost'} btn-sm shrink-0`}
            >
              {option.label}
            </button>
          ),
        )}
      </nav>

      <TaskSections
        tasks={visible}
        empty={<>🪁 No tasks here yet. Tap “New task” to start the fun!</>}
        renderTask={(task) => (
          <TaskCard
            key={task.id}
            task={task}
            viewer="parent"
            kids={kids}
            onStatusChange={(taskId, status: TaskStatus) => refreshAfter(() => updateTaskStatus(taskId, status))}
            onOccurrenceStatusChange={(occurrenceId, status) => refreshAfter(() => updateOccurrenceStatus(occurrenceId, status))}
            onAdvance={(taskId) => refreshAfter(() => advanceTask(taskId), 'Passed to the next kid! 🔄')}
            onEdit={(t) => {
              setEditing(t)
              setFormOpen(true)
            }}
            onShowLog={(t) => attempt(async () => setLog({ task: t, entries: await fetchTaskLogs(t.id) }))}
            onDelete={setDeleting}
          />
        )}
      />

      {log && (
        <Modal title={log.task.title} subtitle="Status history" onClose={() => setLog(null)}>
          <ul className="space-y-2">
            {log.entries.map((entry) => (
              <li key={entry.id} className="rounded-2xl bg-grape-50 px-4 py-3">
                <p className="text-sm text-grape-400">{new Date(entry.changed_at).toLocaleString()}</p>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-grape-900">
                  <strong>{changedBy(entry.changed_by)}</strong> <StatusPill status={entry.previous_status} /> ➜ <StatusPill status={entry.new_status} />
                </p>
              </li>
            ))}
          </ul>
        </Modal>
      )}

      {deleting && (
        <Modal title={`Delete “${deleting.title}”?`} subtitle="Are you sure?" onClose={cancelDelete}>
          <p className="text-grape-700">This removes the task and its history for everyone.</p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button type="button" className="btn-ghost" onClick={cancelDelete}>
              Keep it
            </button>
            <button
              type="button"
              className="btn-danger"
              onClick={() =>
                refreshAfter(async () => {
                  await deleteTask(deleting.id)
                  setDeleting(null)
                }, 'Task deleted')
              }
            >
              🗑️ Delete
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
