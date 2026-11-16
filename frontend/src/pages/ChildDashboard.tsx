import { useCallback, useEffect, useState } from 'react'
import {
  completeOccurrence,
  completeTask,
  fetchChildRedemptions,
  fetchChildRewards,
  fetchChildStats,
  fetchChildTasks,
  redeemReward,
  updateProfile,
  updateTaskStatus,
} from '../api'
import type { ChildStats, ProfileUpdate, Redemption, Reward, Task, User } from '../types'
import BadgeGrid from '../components/BadgeGrid'
import Confetti from '../components/Confetti'
import Modal from '../components/Modal'
import Navbar from '../components/Navbar'
import ProfileEditor from '../components/ProfileEditor'
import RedemptionList from '../components/RedemptionList'
import RewardShop from '../components/RewardShop'
import TaskCard from '../components/TaskCard'
import TaskSections from '../components/TaskSections'
import { useToast } from '../components/Toast'
import { avatarFor, currentOccurrence, userName } from '../lib/tasks'

interface ChildDashboardProps {
  user: User
  onLogout: () => void
  onUserChange: (user: User) => void
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

export default function ChildDashboard({ user, onLogout, onUserChange }: ChildDashboardProps) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [stats, setStats] = useState<ChildStats>({ stars: 0, spent: 0, balance: 0, completed_count: 0, streak_days: 0, badges: [] })
  const [rewards, setRewards] = useState<Reward[]>([])
  const [redemptions, setRedemptions] = useState<Redemption[]>([])
  const [loaded, setLoaded] = useState(false)
  const [celebrations, setCelebrations] = useState(0)
  const [editingProfile, setEditingProfile] = useState(false)
  const { toast, attempt } = useToast()

  const load = useCallback(async () => {
    const [nextTasks, nextStats, nextRewards, nextRedemptions] = await Promise.all([
      fetchChildTasks(),
      fetchChildStats(),
      fetchChildRewards(),
      fetchChildRedemptions(),
    ])
    setTasks(nextTasks)
    setStats(nextStats)
    setRewards(nextRewards)
    setRedemptions(nextRedemptions)
    setLoaded(true)
  }, [])

  useEffect(() => {
    attempt(load)
  }, [attempt, load])

  /** Tasks that need a grown-up's yes just say so, and do not celebrate yet. */
  const finish = async (action: () => Promise<unknown>, needsApproval: boolean) => {
    const done = await attempt(() => action().then(load), needsApproval ? 'Sent to your parent to approve 📬' : 'Awesome job! You earned stars ⭐')
    if (done && !needsApproval) setCelebrations((n) => n + 1)
  }

  const redeem = (reward: Reward) =>
    attempt(() => redeemReward(reward.id).then(load), `${reward.name} requested! A grown-up will hand it over 🎁`)

  const saveProfile = (profile: ProfileUpdate) =>
    attempt(async () => {
      onUserChange(await updateProfile(profile))
      setEditingProfile(false)
    }, 'Looking good! ✨')

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
          <span
            className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full text-5xl shadow-chunky"
            style={{ backgroundColor: user.color ?? undefined }}
            aria-hidden="true"
          >
            {avatarFor(user)}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-3xl text-grape-900 sm:text-4xl">Hi {userName(user).split(' ')[0]}! 👋</h1>
            <p className="text-grape-700">Ready for today's adventure?</p>
            <button type="button" className="btn-ghost btn-sm mt-2" onClick={() => setEditingProfile(true)}>
              ✏️ Edit my look
            </button>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-3 gap-3">
          <StatBubble emoji="⭐" value={stats.balance} label="Stars" className="border-sunny-400 bg-sunny-200 text-grape-900" />
          <StatBubble emoji="🔥" value={stats.streak_days} label="Day streak" className="border-tangy-600 bg-tangy-400 text-white" />
          <StatBubble emoji="✅" value={stats.completed_count} label="Done" className="border-leaf-600 bg-leaf-400 text-white" />
        </div>
        <p className="mt-3 text-center text-sm font-semibold text-grape-700">
          You've earned {stats.stars} stars in all and spent {stats.spent}.
        </p>
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
              onComplete={(taskId) => finish(() => completeTask(taskId), task.requires_approval)}
              onCompleteOccurrence={(occurrenceId) => finish(() => completeOccurrence(occurrenceId), task.requires_approval)}
              onStart={(taskId) => attempt(() => updateTaskStatus(taskId, 'in_progress').then(load), "Go go go! 🚀")}
            />
          )}
        />
      )}

      <section className="card mt-8 border-sunny-200" aria-labelledby="shop-heading">
        <h2 id="shop-heading" className="text-2xl text-grape-900">
          🛍️ Reward shop
        </h2>
        <p className="mb-4 mt-1 text-grape-700">
          You have ⭐ {stats.balance} to spend.
        </p>
        <RewardShop rewards={rewards} balance={stats.balance} onRedeem={redeem} />
      </section>

      <section className="card mt-8 border-grape-100" aria-labelledby="badges-heading">
        <h2 id="badges-heading" className="text-2xl text-grape-900">
          🏅 My badges
        </h2>
        <div className="mt-4">
          <BadgeGrid badges={stats.badges} />
        </div>
      </section>

      <section className="card mt-8 border-bubble-200" aria-labelledby="my-rewards-heading">
        <h2 id="my-rewards-heading" className="text-2xl text-grape-900">
          🎁 My rewards
        </h2>
        <div className="mt-4">
          <RedemptionList redemptions={redemptions} emptyText="Nothing yet. Save up your stars and pick a treat! ⭐" />
        </div>
      </section>

      {editingProfile && (
        <Modal title="My look" subtitle="Make it yours" onClose={() => setEditingProfile(false)}>
          <ProfileEditor user={user} onSave={saveProfile} />
        </Modal>
      )}
    </div>
  )
}
