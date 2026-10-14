import { useCallback, useEffect, useState } from 'react'
import { completeOccurrence, completeTask, fetchChildStats, fetchChildTasks, updateTaskStatus } from '../api'
import type { ChildStats, Task, User } from '../types'
import Confetti from '../components/Confetti'
import Navbar from '../components/Navbar'
import TaskCard from '../components/TaskCard'
import TaskSections from '../components/TaskSections'
import { useToast } from '../components/Toast'
import { currentOccurrence, kidEmoji, userName } from '../lib/tasks'

interface ChildDashboardProps {
  user: User
  onLogout: () => void
}

function StatBubble({ emoji, value, label, className }: { emoji: string; value: number; label: string; className: string }) {
  return (
    <div className={`flex flex-col items-center rounded-3xl border-b-4 px-2 py-3 text-center ${className}`}>
      <span className="text-3xl" aria-hidden="true">
        {emoji}
      </span>
      <span className="text-2xl font-bold sm:text-3xl">{value}</span>
      <span className="text-xs font-semibold uppercase tracking-wide sm:text-sm">{label}</span>
    </div>
  )
}

export default function ChildDashboard({ user, onLogout }: ChildDashboardProps) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [stats, setStats] = useState<ChildStats>({ stars: 0, completed_count: 0, streak_days: 0 })
  const [loaded, setLoaded] = useState(false)
  const [celebrations, setCelebrations] = useState(0)
  const { toast, attempt } = useToast()

  const load = useCallback(async () => {
    const [nextTasks, nextStats] = await Promise.all([fetchChildTasks(), fetchChildStats()])
    setTasks(nextTasks)
    setStats(nextStats)
    setLoaded(true)
  }, [])

  useEffect(() => {
    attempt(load)
  }, [attempt, load])

  const celebrate = async (action: () => Promise<unknown>) => {
    if (await attempt(() => action().then(load), 'Awesome job! You earned stars ⭐')) {
      setCelebrations((n) => n + 1)
    }
  }

  const isDone = (task: Task) =>
    task.task_type === 'recurring'
      ? currentOccurrence(task)?.status === 'completed'
      : Boolean(task.assignments.find((a) => a.child_id === user.id)?.completed)
  const doneCount = tasks.filter(isDone).length

  return (
    <div className="mx-auto max-w-5xl px-4 pb-16">
      <Navbar user={user} onLogout={onLogout} />
      {toast}
      {celebrations > 0 && <Confetti key={celebrations} />}

      <section className="card mb-8 border-sunny-200 bg-gradient-to-br from-sunny-100 via-white to-bubble-50">
        <div className="flex items-center gap-4">
          <span className="text-6xl" aria-hidden="true">
            {kidEmoji(user.id)}
          </span>
          <div>
            <h1 className="text-3xl text-grape-900 sm:text-4xl">Hi {userName(user).split(' ')[0]}! 👋</h1>
            <p className="text-grape-700">Ready for today's adventure?</p>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-3 gap-3">
          <StatBubble emoji="⭐" value={stats.stars} label="Stars" className="border-sunny-400 bg-sunny-200 text-grape-900" />
          <StatBubble emoji="🔥" value={stats.streak_days} label="Day streak" className="border-tangy-600 bg-tangy-400 text-white" />
          <StatBubble emoji="✅" value={stats.completed_count} label="Done" className="border-leaf-600 bg-leaf-400 text-white" />
        </div>
        {tasks.length > 0 && (
          <div className="mt-5">
            <div className="mb-1 flex justify-between text-sm font-semibold text-grape-700">
              <span>Today's progress</span>
              <span>
                {doneCount} of {tasks.length} done
              </span>
            </div>
            <div
              className="h-5 overflow-hidden rounded-full bg-white ring-2 ring-grape-100"
              role="progressbar"
              aria-label="Today's progress"
              aria-valuemin={0}
              aria-valuemax={tasks.length}
              aria-valuenow={doneCount}
            >
              <div
                className="h-full rounded-full bg-gradient-to-r from-bubble-400 via-sunny-300 to-leaf-400 transition-all duration-700"
                style={{ width: `${(doneCount / tasks.length) * 100}%` }}
              />
            </div>
          </div>
        )}
      </section>

      {loaded && (
        <TaskSections
          tasks={[...tasks].sort((a, b) => Number(isDone(a)) - Number(isDone(b)))}
          empty={<>🎈 No tasks right now. Go play!</>}
          renderTask={(task) => (
            <TaskCard
              key={task.id}
              task={task}
              viewer="child"
              childId={user.id}
              onComplete={(taskId) => celebrate(() => completeTask(taskId))}
              onCompleteOccurrence={(occurrenceId) => celebrate(() => completeOccurrence(occurrenceId))}
              onStart={(taskId) => attempt(() => updateTaskStatus(taskId, 'in_progress').then(load), "Go go go! 🚀")}
            />
          )}
        />
      )}
    </div>
  )
}
