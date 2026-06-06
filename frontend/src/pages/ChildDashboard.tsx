import { useEffect, useState } from 'react'
import { completeTask, fetchChildTasks } from '../api'
import { Task, User } from '../types'
import Navbar from '../components/Navbar'
import TaskCard from '../components/TaskCard'

interface ChildDashboardProps {
  user: User
  onLogout: () => void
}

export default function ChildDashboard({ user, onLogout }: ChildDashboardProps) {
  const [tasks, setTasks] = useState<Task[]>([])

  const loadTasks = async () => {
    setTasks(await fetchChildTasks())
  }

  useEffect(() => {
    loadTasks()
  }, [])

  const handleComplete = async (taskId: number) => {
    await completeTask(taskId)
    loadTasks()
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <Navbar
        title={`Hi, ${user.full_name || user.email}`}
        actions={
          <button onClick={onLogout} className="rounded-2xl border border-slate-300 px-4 py-2 text-sm">
            Logout
          </button>
        }
      />
      <div className="mb-6 rounded-3xl bg-gradient-to-r from-kids-100 via-white to-slate-50 p-6 shadow-lg shadow-kids-100">
        <p className="text-sm text-kids-700">Your task board is ready! Complete chores to earn badges and smiles.</p>
      </div>
      <section className="rounded-3xl bg-white p-6 shadow-lg shadow-slate-200">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-brand-700">Child view</p>
            <h2 className="mt-2 text-3xl font-semibold text-slate-900">Your tasks</h2>
          </div>
          <p className="rounded-3xl bg-slate-100 px-4 py-3 text-sm text-slate-600">Stay on track and earn reward points!</p>
        </div>
        <div className="mt-6 space-y-8">
          <div>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Recurring</p>
                <h3 className="mt-2 text-2xl font-semibold text-slate-900">Ongoing chores</h3>
              </div>
              <span className="rounded-full bg-brand-50 px-3 py-1 text-sm text-brand-700">
                {tasks.filter((task) => task.recurrence).length} items
              </span>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              {tasks.filter((task) => task.recurrence).length === 0 ? (
                <div className="rounded-3xl border border-dashed border-slate-300 p-6 text-slate-500">No recurring tasks assigned yet.</div>
              ) : (
                tasks
                  .filter((task) => task.recurrence)
                  .map((task) => <TaskCard key={task.id} task={task} onComplete={handleComplete} isChildView />)
              )}
            </div>
          </div>
          <div>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm uppercase tracking-[0.2em] text-slate-500">One-time</p>
                <h3 className="mt-2 text-2xl font-semibold text-slate-900">Single tasks</h3>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">
                {tasks.filter((task) => !task.recurrence).length} items
              </span>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              {tasks.filter((task) => !task.recurrence).length === 0 ? (
                <div className="rounded-3xl border border-dashed border-slate-300 p-6 text-slate-500">No one-time tasks assigned yet.</div>
              ) : (
                tasks
                  .filter((task) => !task.recurrence)
                  .map((task) => <TaskCard key={task.id} task={task} onComplete={handleComplete} isChildView />)
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
