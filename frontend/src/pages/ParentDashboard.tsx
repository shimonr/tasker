import { FormEvent, useEffect, useState } from 'react'
import { createTask, fetchChildren, fetchParentTasks, fetchStats } from '../api'
import { Task, User } from '../types'
import Navbar from '../components/Navbar'
import TaskCard from '../components/TaskCard'

interface ParentDashboardProps {
  user: User
  onLogout: () => void
}

export default function ParentDashboard({ user, onLogout }: ParentDashboardProps) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [stats, setStats] = useState({ total_tasks: 0, completed_tasks: 0, pending_tasks: 0 })
  const [children, setChildren] = useState<User[]>([])
  const [selectedChildIds, setSelectedChildIds] = useState<number[]>([])
  const [recurrence, setRecurrence] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [priority, setPriority] = useState('Medium')
  const [formError, setFormError] = useState('')
  const [selectedTab, setSelectedTab] = useState<number | 'all'>('all')

  const loadTasks = async () => {
    setTasks(await fetchParentTasks())
    setStats(await fetchStats())
  }

  const loadChildren = async () => {
    setChildren(await fetchChildren())
  }

  useEffect(() => {
    loadTasks()
    loadChildren()
  }, [])

  const toggleChildSelection = (childId: number) => {
    setSelectedChildIds((current) =>
      current.includes(childId) ? current.filter((id) => id !== childId) : [...current, childId]
    )
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFormError('')

    if (selectedChildIds.length === 0) {
      setFormError('Please assign this task to at least one child.')
      return
    }

    await createTask({
      title,
      description,
      due_date: dueDate ? new Date(dueDate).toISOString() : undefined,
      priority,
      assignee_ids: selectedChildIds,
      recurrence: recurrence || undefined,
    })
    setTitle('')
    setDescription('')
    setDueDate('')
    setPriority('Medium')
    setSelectedChildIds([])
    setRecurrence('')
    setFormError('')
    loadTasks()
  }

  const selectedTasks =
    selectedTab === 'all'
      ? tasks
      : tasks.filter((task) => task.assignments.some((assignment) => assignment.child_id === selectedTab))

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <Navbar
        title={`Welcome, ${user.full_name || user.email}`}
        actions={
          <button onClick={onLogout} className="rounded-2xl border border-slate-300 px-4 py-2 text-sm">
            Logout
          </button>
        }
      />
      <section className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <article className="rounded-3xl bg-white p-6 shadow-lg shadow-slate-200">
          <h2 className="text-2xl font-semibold text-slate-900">Create a task</h2>
          <p className="mt-2 text-sm text-kids-700">Make chores exciting by assigning clear tasks and rewards.</p>
          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Task title"
              className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-brand-500"
              required
            />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description"
              className="w-full rounded-3xl border border-slate-300 px-4 py-3 outline-none focus:border-brand-500"
              rows={4}
            />
            <div className="grid gap-4 md:grid-cols-2">
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-brand-500"
              />
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-brand-500"
              >
                <option>Low</option>
                <option>Medium</option>
                <option>High</option>
              </select>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <p className="mb-3 text-sm font-semibold text-slate-700">Assign to children</p>
              <div className="grid gap-3">
                {children.length === 0 ? (
                  <p className="text-sm text-slate-500">No child accounts found yet.</p>
                ) : (
                  children.map((child) => (
                    <label key={child.id} className="inline-flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedChildIds.includes(child.id)}
                        onChange={() => toggleChildSelection(child.id)}
                        className="h-4 w-4 rounded border-slate-300 text-brand-600"
                      />
                      <span className="text-sm text-slate-700">{child.full_name || child.username || child.email}</span>
                    </label>
                  ))
                )}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">
                Repeat task
                <select
                  value={recurrence}
                  onChange={(e) => setRecurrence(e.target.value)}
                  className="mt-2 block w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-brand-500"
                >
                  <option value="">Does not repeat</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </label>
            </div>
            {formError && <p className="text-sm text-rose-600">{formError}</p>}
            <button className="w-full rounded-2xl bg-brand-500 px-4 py-3 text-white transition hover:bg-brand-600">
              Create task
            </button>
          </form>
        </article>
        <article className="rounded-3xl bg-white p-6 shadow-lg shadow-slate-200">
          <h2 className="text-2xl font-semibold text-slate-900">Summary</h2>
          <p className="mt-2 text-sm text-kids-700">Track how the family is doing at a glance.</p>
          <div className="mt-6 space-y-4">
            <div className="rounded-3xl bg-slate-50 p-5">
              <p className="text-sm text-slate-500">Total tasks</p>
              <p className="mt-2 text-3xl font-semibold">{stats.total_tasks}</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-3xl bg-emerald-50 p-5">
                <p className="text-sm text-emerald-700">Completed</p>
                <p className="mt-2 text-2xl font-semibold text-emerald-900">{stats.completed_tasks}</p>
              </div>
              <div className="rounded-3xl bg-amber-50 p-5">
                <p className="text-sm text-amber-700">Pending</p>
                <p className="mt-2 text-2xl font-semibold text-amber-900">{stats.pending_tasks}</p>
              </div>
            </div>
          </div>
        </article>
      </section>
      <section className="mt-8 rounded-3xl bg-white p-6 shadow-lg shadow-slate-200">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            className={`rounded-2xl px-4 py-2 text-sm font-medium ${selectedTab === 'all' ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-700'}`}
            onClick={() => setSelectedTab('all')}
          >
            All tasks
          </button>
          {children.map((child) => (
            <button
              key={child.id}
              type="button"
              className={`rounded-2xl px-4 py-2 text-sm font-medium ${selectedTab === child.id ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-700'}`}
              onClick={() => setSelectedTab(child.id)}
            >
              {child.full_name || child.username || child.email}
            </button>
          ))}
        </div>
        <div className="mb-4 text-sm text-slate-500">
          Showing {selectedTasks.length} task{selectedTasks.length === 1 ? '' : 's'} for {selectedTab === 'all' ? 'all children' : children.find((child) => child.id === selectedTab)?.full_name || selectedTab}.
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {selectedTasks.length === 0 ? (
            <div className="rounded-3xl bg-slate-50 p-6 text-slate-500 shadow-lg shadow-slate-200">
              No tasks match this selection yet.
            </div>
          ) : (
            selectedTasks.map((task) => <TaskCard key={task.id} task={task} />)
          )}
        </div>
      </section>
    </div>
  )
}
