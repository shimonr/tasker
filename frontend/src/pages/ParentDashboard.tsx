import { FormEvent, useEffect, useMemo, useState } from 'react'
import { createTask, deleteTask, fetchChildren, fetchParentTasks, fetchStats, fetchTaskLogs, updateTaskStatus, updateTask, advanceTask } from '../api'
import { Task, User } from '../types'
import Navbar from '../components/Navbar'
import TaskCard from '../components/TaskCard'

interface ParentDashboardProps {
  user: User
  onLogout: () => void
}

const statusLabel: Record<string, string> = {
  pending: 'Pending',
  in_progress: 'In progress',
  failed: 'Failed',
  completed: 'Completed',
}

export default function ParentDashboard({ user, onLogout }: ParentDashboardProps) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [stats, setStats] = useState({ total_tasks: 0, completed_tasks: 0, pending_tasks: 0, in_progress_tasks: 0, failed_tasks: 0 })
  const [children, setChildren] = useState<User[]>([])
  const [selectedChildIds, setSelectedChildIds] = useState<number[]>([])
  const [taskType, setTaskType] = useState<'adhoc' | 'recurring' | 'rotating'>('adhoc')
  const [recurrence, setRecurrence] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [startDate, setStartDate] = useState('')
  const [priority, setPriority] = useState('Medium')
  const [formError, setFormError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [selectedTab, setSelectedTab] = useState<number | 'all'>('all')
  const [taskLogs, setTaskLogs] = useState<Record<number, any[]>>({})
  const [activeLogTaskId, setActiveLogTaskId] = useState<number | null>(null)
  const [editingTask, setEditingTask] = useState<Task | null>(null)

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

  const resetForm = () => {
    setTitle('')
    setDescription('')
    setDueDate('')
    setStartDate('')
    setPriority('Medium')
    setSelectedChildIds([])
    setRecurrence('')
    setFormError('')
    setEditingTask(null)
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFormError('')

    if (selectedChildIds.length === 0) {
      setFormError('Please assign this task to at least one child.')
      return
    }

    if (taskType === 'rotating' && selectedChildIds.length < 2) {
      setFormError('Rotating tasks require at least 2 children.')
      return
    }

    if (taskType === 'adhoc' && !dueDate) {
      setFormError('Ad-hoc tasks require a due date.')
      return
    }

    if (taskType === 'adhoc' && dueDate) {
      const selectedDate = new Date(dueDate)
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      if (selectedDate < today) {
        setFormError('Due date cannot be in the past.')
        return
      }
    }

    if (taskType === 'recurring' && !recurrence) {
      setFormError('Recurring tasks require a frequency.')
      return
    }

    const taskData = {
      title,
      description,
      due_date: taskType === 'adhoc' && dueDate ? new Date(dueDate).toISOString() : undefined,
      start_date: taskType === 'recurring' && startDate ? new Date(startDate).toISOString() : undefined,
      priority,
      assignee_ids: selectedChildIds,
      recurrence: taskType === 'recurring' ? recurrence : undefined,
      task_type: taskType,
    }

    if (editingTask) {
      await updateTask(editingTask.id, taskData)
      setSuccessMessage('Task updated successfully!')
    } else {
      await createTask(taskData)
      setSuccessMessage('Task created successfully!')
    }

    resetForm()
    setTimeout(() => setSuccessMessage(''), 3000)
    loadTasks()
  }

  const handleEditTask = (task: Task) => {
    setEditingTask(task)
    setTitle(task.title)
    setDescription(task.description || '')
    setPriority(task.priority || 'Medium')
    setTaskType(task.task_type === 'rotating' ? 'rotating' : task.recurrence ? 'recurring' : 'adhoc')
    setRecurrence(task.recurrence || '')
    setSelectedChildIds(task.assignments.map((a) => a.child_id))

    if (task.due_date) {
      const d = new Date(task.due_date)
      setDueDate(d.toISOString().split('T')[0])
    } else {
      setDueDate('')
    }
    if (task.start_date) {
      const s = new Date(task.start_date)
      setStartDate(s.toISOString().split('T')[0])
    } else {
      setStartDate('')
    }

    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const selectedTasks = useMemo(
    () =>
      selectedTab === 'all'
        ? tasks
        : tasks.filter((task) => task.assignments.some((assignment) => assignment.child_id === selectedTab)),
    [selectedTab, tasks]
  )

  const adHocTasks = selectedTasks.filter((task) => task.task_type === 'adhoc' && !task.recurrence)
  const dailyTasks = selectedTasks.filter((task) => task.task_type === 'recurring' && task.recurrence === 'daily')
  const weeklyTasks = selectedTasks.filter((task) => task.task_type === 'recurring' && task.recurrence === 'weekly')
  const monthlyTasks = selectedTasks.filter((task) => task.task_type === 'recurring' && task.recurrence === 'monthly')
  const yearlyTasks = selectedTasks.filter((task) => task.task_type === 'recurring' && task.recurrence === 'yearly')
  const rotatingTasks = selectedTasks.filter((task) => task.task_type === 'rotating')

  const handleStatusChange = async (taskId: number, status: string) => {
    await updateTaskStatus(taskId, status)
    await loadTasks()
  }

  const showTaskLog = async (taskId: number) => {
    if (activeLogTaskId === taskId) {
      setActiveLogTaskId(null)
      return
    }

    const logs = await fetchTaskLogs(taskId)
    setTaskLogs((current) => ({ ...current, [taskId]: logs }))
    setActiveLogTaskId(taskId)
  }

  const handleDeleteTask = async (taskId: number) => {
    if (!window.confirm('Delete this task?')) {
      return
    }

    await deleteTask(taskId)
    await loadTasks()
    if (activeLogTaskId === taskId) {
      setActiveLogTaskId(null)
    }
  }

  const handleAdvance = async (taskId: number) => {
    await advanceTask(taskId)
    await loadTasks()
  }

  const getUserName = (userId: number) => {
    if (userId === user.id) return user.full_name || user.email
    const child = children.find((c) => c.id === userId)
    return child?.full_name || child?.username || child?.email || `User #${userId}`
  }

  const activeLogTask = activeLogTaskId !== null ? tasks.find((task) => task.id === activeLogTaskId) : undefined

  return (
    <div className="relative mx-auto max-w-6xl px-4 py-8">
      <Navbar
        title={`Welcome, ${user.full_name || user.email}`}
        actions={
          <button onClick={onLogout} className="rounded-2xl border border-slate-300 px-4 py-2 text-sm">
            Logout
          </button>
        }
      />
      <section className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        {successMessage && (
          <div className="absolute top-4 left-1/2 z-50 -translate-x-1/2 rounded-2xl bg-emerald-500 px-6 py-3 text-sm font-semibold text-white shadow-lg transition-opacity">
            {successMessage}
          </div>
        )}
        <article className="rounded-3xl bg-white p-6 shadow-lg shadow-slate-200">
          <h2 className="text-2xl font-semibold text-slate-900">{editingTask ? 'Edit task' : 'Create a task'}</h2>
          <p className="mt-2 text-sm text-kids-700">Make chores exciting by assigning clear tasks and rewards.</p>
          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="inline-flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <input type="radio" checked={taskType === 'adhoc'} onChange={() => setTaskType('adhoc')} disabled={!!editingTask} />
                <span>Ad-hoc task</span>
              </label>
              <label className="inline-flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <input type="radio" checked={taskType === 'recurring'} onChange={() => setTaskType('recurring')} disabled={!!editingTask} />
                <span>Recurring task</span>
              </label>
              <label className="inline-flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <input type="radio" checked={taskType === 'rotating'} onChange={() => setTaskType('rotating')} disabled={!!editingTask} />
                <span>Rotating task</span>
              </label>
            </div>
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
              {taskType === 'adhoc' && (
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-brand-500"
                  required
                />
              )}
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
            {taskType === 'recurring' && (
              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Frequency
                  <select
                    value={recurrence}
                    onChange={(e) => setRecurrence(e.target.value)}
                    className="mt-2 block w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-brand-500"
                  >
                    <option value="">Select a recurrence</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                </label>
              </div>
            )}
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
            {formError && <p className="text-sm text-rose-600">{formError}</p>}
            <div className="flex gap-3">
              <button className="flex-1 rounded-2xl bg-brand-500 px-4 py-3 text-white transition hover:bg-brand-600">
                {editingTask ? 'Update task' : 'Create task'}
              </button>
              {editingTask && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="rounded-2xl border border-slate-300 px-4 py-3 text-slate-700 transition hover:bg-slate-100"
                >
                  Cancel
                </button>
              )}
            </div>
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
              <div className="rounded-3xl bg-sky-50 p-5">
                <p className="text-sm text-sky-700">In progress</p>
                <p className="mt-2 text-2xl font-semibold text-sky-900">{stats.in_progress_tasks}</p>
              </div>
              <div className="rounded-3xl bg-rose-50 p-5">
                <p className="text-sm text-rose-700">Failed</p>
                <p className="mt-2 text-2xl font-semibold text-rose-900">{stats.failed_tasks}</p>
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

        <div className="space-y-8">
          <section>
            <h3 className="mb-4 text-xl font-semibold text-slate-900">Ad-hoc tasks</h3>
            <div className="grid gap-4 lg:grid-cols-2">
              {adHocTasks.length === 0 ? (
                <div className="rounded-3xl bg-slate-50 p-6 text-slate-500 shadow-lg shadow-slate-200">No ad-hoc tasks yet.</div>
              ) : (
                adHocTasks.map((task) => (
                  <TaskCard key={task.id} task={task} onStatusChange={handleStatusChange} onShowLog={showTaskLog} onDelete={handleDeleteTask} onEdit={handleEditTask} onAdvance={handleAdvance} children={children} />
                ))
              )}
            </div>
          </section>

          <section>
            <h3 className="mb-4 text-xl font-semibold text-slate-900">Daily recurring</h3>
            <div className="grid gap-4 lg:grid-cols-2">
              {dailyTasks.length === 0 ? (
                <div className="rounded-3xl bg-slate-50 p-6 text-slate-500 shadow-lg shadow-slate-200">No daily tasks yet.</div>
              ) : (
                dailyTasks.map((task) => (
                  <TaskCard key={task.id} task={task} onStatusChange={handleStatusChange} onShowLog={showTaskLog} onDelete={handleDeleteTask} onEdit={handleEditTask} onAdvance={handleAdvance} children={children} />
                ))
              )}
            </div>
          </section>

          <section>
            <h3 className="mb-4 text-xl font-semibold text-slate-900">Weekly recurring</h3>
            <div className="grid gap-4 lg:grid-cols-2">
              {weeklyTasks.length === 0 ? (
                <div className="rounded-3xl bg-slate-50 p-6 text-slate-500 shadow-lg shadow-slate-200">No weekly tasks yet.</div>
              ) : (
                weeklyTasks.map((task) => (
                  <TaskCard key={task.id} task={task} onStatusChange={handleStatusChange} onShowLog={showTaskLog} onDelete={handleDeleteTask} onEdit={handleEditTask} onAdvance={handleAdvance} children={children} />
                ))
              )}
            </div>
          </section>

          <section>
            <h3 className="mb-4 text-xl font-semibold text-slate-900">Monthly recurring</h3>
            <div className="grid gap-4 lg:grid-cols-2">
              {monthlyTasks.length === 0 ? (
                <div className="rounded-3xl bg-slate-50 p-6 text-slate-500 shadow-lg shadow-slate-200">No monthly tasks yet.</div>
              ) : (
                monthlyTasks.map((task) => (
                  <TaskCard key={task.id} task={task} onStatusChange={handleStatusChange} onShowLog={showTaskLog} onDelete={handleDeleteTask} onEdit={handleEditTask} onAdvance={handleAdvance} children={children} />
                ))
              )}
            </div>
          </section>

          <section>
            <h3 className="mb-4 text-xl font-semibold text-slate-900">Yearly recurring</h3>
            <div className="grid gap-4 lg:grid-cols-2">
              {yearlyTasks.length === 0 ? (
                <div className="rounded-3xl bg-slate-50 p-6 text-slate-500 shadow-lg shadow-slate-200">No yearly tasks yet.</div>
              ) : (
                yearlyTasks.map((task) => (
                  <TaskCard key={task.id} task={task} onStatusChange={handleStatusChange} onShowLog={showTaskLog} onDelete={handleDeleteTask} onEdit={handleEditTask} onAdvance={handleAdvance} children={children} />
                ))
              )}
            </div>
          </section>

          <section>
            <h3 className="mb-4 text-xl font-semibold text-slate-900">Rotating</h3>
            <div className="grid gap-4 lg:grid-cols-2">
              {rotatingTasks.length === 0 ? (
                <div className="rounded-3xl bg-slate-50 p-6 text-slate-500 shadow-lg shadow-slate-200">No rotating tasks yet.</div>
              ) : (
                rotatingTasks.map((task) => (
                  <TaskCard key={task.id} task={task} onStatusChange={handleStatusChange} onShowLog={showTaskLog} onDelete={handleDeleteTask} onEdit={handleEditTask} onAdvance={handleAdvance} children={children} />
                ))
              )}
            </div>
          </section>
        </div>

        {activeLogTaskId !== null && taskLogs[activeLogTaskId] && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
            <div className="w-full max-w-3xl overflow-hidden rounded-3xl bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
                <div>
                  <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Status change log</p>
                  <h3 className="text-xl font-semibold text-slate-900">{activeLogTask?.title || 'Task log'}</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveLogTaskId(null)}
                  className="rounded-2xl border border-slate-200 bg-slate-100 px-4 py-2 text-sm text-slate-700 hover:bg-slate-200"
                >
                  Close
                </button>
              </div>
              <div className="max-h-[70vh] overflow-y-auto p-6">
                <div className="space-y-3">
                  {taskLogs[activeLogTaskId].map((log) => (
                    <div key={log.id} className="rounded-3xl bg-slate-50 p-4 shadow-sm">
                      <p className="text-sm text-slate-500">{new Date(log.changed_at).toLocaleString()}</p>
                      <p className="mt-2 text-sm text-slate-700">
                        {getUserName(log.changed_by)} changed from <strong>{statusLabel[log.previous_status] || log.previous_status}</strong> to <strong>{statusLabel[log.new_status] || log.new_status}</strong>
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
