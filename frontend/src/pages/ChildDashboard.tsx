import { useEffect, useState } from 'react'
import { completeTask, fetchChildTasks, updateTaskStatus } from '../api'
import { Task, User } from '../types'
import Navbar from '../components/Navbar'
import TaskCard from '../components/TaskCard'

interface ChildDashboardProps {
  user: User
  onLogout: () => void
}

export default function ChildDashboard({ user, onLogout }: ChildDashboardProps) {
  const [tasks, setTasks] = useState<Task[]>([])
  const childId = user.id

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

  const handleStatusChange = async (taskId: number, status: string) => {
    await updateTaskStatus(taskId, status)
    loadTasks()
  }

  const adHocTasks = tasks.filter((task) => task.task_type === 'adhoc' && !task.recurrence)
  const dailyTasks = tasks.filter((task) => task.task_type === 'recurring' && task.recurrence === 'daily')
  const weeklyTasks = tasks.filter((task) => task.task_type === 'recurring' && task.recurrence === 'weekly')
  const monthlyTasks = tasks.filter((task) => task.task_type === 'recurring' && task.recurrence === 'monthly')
  const yearlyTasks = tasks.filter((task) => task.task_type === 'recurring' && task.recurrence === 'yearly')
  const rotatingTasks = tasks.filter((task) => task.task_type === 'rotating')

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
        <div className="mt-6 space-y-10">
          <div>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm uppercase tracking-[0.2em] text-slate-500">One-time</p>
                <h3 className="mt-2 text-2xl font-semibold text-slate-900">Ad-hoc tasks</h3>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">{adHocTasks.length} items</span>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              {adHocTasks.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-slate-300 p-6 text-slate-500">No ad-hoc tasks assigned yet.</div>
              ) : (
                adHocTasks.map((task) => (
                  <TaskCard key={task.id} task={task} onComplete={handleComplete} onStatusChange={handleStatusChange} isChildView childId={childId} />
                ))
              )}
            </div>
          </div>

          <div>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Daily</p>
                <h3 className="mt-2 text-2xl font-semibold text-slate-900">Daily tasks</h3>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">{dailyTasks.length} items</span>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              {dailyTasks.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-slate-300 p-6 text-slate-500">No daily tasks assigned yet.</div>
              ) : (
                dailyTasks.map((task) => (
                  <TaskCard key={task.id} task={task} onComplete={handleComplete} onStatusChange={handleStatusChange} isChildView childId={childId} />
                ))
              )}
            </div>
          </div>

          <div>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Weekly</p>
                <h3 className="mt-2 text-2xl font-semibold text-slate-900">Weekly tasks</h3>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">{weeklyTasks.length} items</span>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              {weeklyTasks.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-slate-300 p-6 text-slate-500">No weekly tasks assigned yet.</div>
              ) : (
                weeklyTasks.map((task) => (
                  <TaskCard key={task.id} task={task} onComplete={handleComplete} onStatusChange={handleStatusChange} isChildView childId={childId} />
                ))
              )}
            </div>
          </div>

          <div>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Monthly</p>
                <h3 className="mt-2 text-2xl font-semibold text-slate-900">Monthly tasks</h3>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">{monthlyTasks.length} items</span>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              {monthlyTasks.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-slate-300 p-6 text-slate-500">No monthly tasks assigned yet.</div>
              ) : (
                monthlyTasks.map((task) => (
                  <TaskCard key={task.id} task={task} onComplete={handleComplete} onStatusChange={handleStatusChange} isChildView childId={childId} />
                ))
              )}
            </div>
          </div>

          <div>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Yearly</p>
                <h3 className="mt-2 text-2xl font-semibold text-slate-900">Yearly tasks</h3>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">{yearlyTasks.length} items</span>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              {yearlyTasks.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-slate-300 p-6 text-slate-500">No yearly tasks assigned yet.</div>
              ) : (
                yearlyTasks.map((task) => (
                  <TaskCard key={task.id} task={task} onComplete={handleComplete} onStatusChange={handleStatusChange} isChildView childId={childId} />
                ))
              )}
            </div>
          </div>

          <div>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Rotating</p>
                <h3 className="mt-2 text-2xl font-semibold text-slate-900">Rotating tasks</h3>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">{rotatingTasks.length} items</span>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              {rotatingTasks.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-slate-300 p-6 text-slate-500">No rotating tasks assigned yet.</div>
              ) : (
                rotatingTasks.map((task) => (
                  <TaskCard key={task.id} task={task} onComplete={handleComplete} onStatusChange={handleStatusChange} isChildView childId={childId} />
                ))
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
