import { FormEvent, useState } from 'react'
import { createReward, deleteReward, updateReward } from '../api'
import type { Reward } from '../types'
import Modal from './Modal'
import FormField from './FormField'

interface RewardsManagerProps {
  rewards: Reward[]
  run: (action: () => Promise<unknown>, success?: string) => Promise<boolean>
}

const BLANK = { name: '', emoji: '', cost: '10' }

/** Create, edit, pause and remove the treats kids can buy with stars. */
export default function RewardsManager({ rewards, run }: RewardsManagerProps) {
  const [draft, setDraft] = useState(BLANK)
  const [editing, setEditing] = useState<Reward | null>(null)
  const [edit, setEdit] = useState(BLANK)
  const [deleting, setDeleting] = useState<Reward | null>(null)

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const created = await run(() => createReward({ name: draft.name, emoji: draft.emoji || undefined, cost: Number(draft.cost) }), 'Reward added! 🎁')
    if (created) setDraft(BLANK)
  }

  const startEdit = (reward: Reward) => {
    setEditing(reward)
    setEdit({ name: reward.name, emoji: reward.emoji ?? '', cost: String(reward.cost) })
  }

  const saveEdit = (reward: Reward) =>
    run(async () => {
      await updateReward(reward.id, { name: edit.name, emoji: edit.emoji, cost: Number(edit.cost) })
      setEditing(null)
    }, 'Reward saved!')

  const toggle = (reward: Reward) =>
    run(() => updateReward(reward.id, { active: !reward.active }), reward.active ? 'Paused. Kids can’t see it for now.' : 'Back on the shop! 🛍️')

  const remove = (reward: Reward) =>
    run(async () => {
      await deleteReward(reward.id)
      setDeleting(null)
    }, 'Reward removed')

  return (
    <div className="space-y-5">
      {rewards.length === 0 ? (
        <p className="rounded-2xl bg-grape-50 px-4 py-3 text-grape-700">No rewards yet. Add a treat below, kids love a prize! 🍦</p>
      ) : (
        <ul className="space-y-3" aria-label="Rewards">
          {rewards.map((reward) =>
            editing?.id === reward.id ? (
              <li key={reward.id} className="rounded-3xl border-2 border-ocean-200 bg-ocean-50/50 p-4">
                <form className="grid gap-3 sm:grid-cols-3" aria-label={`Edit ${reward.name}`} onSubmit={(e) => { e.preventDefault(); saveEdit(reward) }}>
                  <input aria-label="Edit name" required maxLength={100} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} className="input py-2" />
                  <input aria-label="Edit emoji" maxLength={8} value={edit.emoji} onChange={(e) => setEdit({ ...edit, emoji: e.target.value })} className="input py-2" />
                  <input
                    aria-label="Edit cost"
                    type="number"
                    min={1}
                    max={10000}
                    required
                    value={edit.cost}
                    onChange={(e) => setEdit({ ...edit, cost: e.target.value })}
                    className="input py-2"
                  />
                  <div className="flex gap-2 sm:col-span-3">
                    <button type="submit" className="btn-primary btn-sm">
                      💾 Save
                    </button>
                    <button type="button" className="btn-ghost btn-sm" onClick={() => setEditing(null)}>
                      Cancel
                    </button>
                  </div>
                </form>
              </li>
            ) : (
              <li
                key={reward.id}
                className={`flex flex-wrap items-center gap-3 rounded-3xl border-2 px-4 py-3 ${reward.active ? 'border-grape-50 bg-white' : 'border-dashed border-grape-200 bg-grape-50/60'}`}
              >
                <span className="text-3xl" aria-hidden="true">
                  {reward.emoji || '🎁'}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-grape-900">{reward.name}</p>
                  <p className="text-sm text-grape-700">
                    ⭐ {reward.cost} stars{!reward.active && ' · Paused'}
                  </p>
                </div>
                <button type="button" className="btn-ghost btn-sm" aria-label={`Edit ${reward.name}`} onClick={() => startEdit(reward)}>
                  ✏️ Edit
                </button>
                <button type="button" className="btn-sunny btn-sm" onClick={() => toggle(reward)}>
                  {reward.active ? '⏸️ Pause' : '▶️ Activate'}
                </button>
                <button type="button" className="btn-ghost btn-sm text-rose-500" aria-label={`Delete ${reward.name}`} onClick={() => setDeleting(reward)}>
                  🗑️
                </button>
              </li>
            ),
          )}
        </ul>
      )}

      <form className="grid gap-3 rounded-3xl border-2 border-dashed border-grape-200 p-4 sm:grid-cols-[1fr_6rem_8rem] sm:items-end" onSubmit={handleCreate} aria-label="New reward">
        <FormField id="reward-name" label="Reward name" required maxLength={100} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Pizza night 🍕" />
        <FormField id="reward-emoji" label="Emoji" maxLength={8} value={draft.emoji} onChange={(e) => setDraft({ ...draft, emoji: e.target.value })} />
        <FormField
          id="reward-cost"
          label="Cost in stars"
          type="number"
          min={1}
          max={10000}
          required
          value={draft.cost}
          onChange={(e) => setDraft({ ...draft, cost: e.target.value })}
        />
        <button type="submit" className="btn-success sm:col-span-3">
          🎁 Add reward
        </button>
      </form>

      {deleting && (
        <Modal title={`Remove “${deleting.name}”?`} subtitle="Are you sure?" onClose={() => setDeleting(null)}>
          <p className="text-grape-700">Kids won’t see it in the shop any more. Stars they already spent stay spent.</p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button type="button" className="btn-ghost" onClick={() => setDeleting(null)}>
              Keep it
            </button>
            <button type="button" className="btn-danger" onClick={() => remove(deleting)}>
              🗑️ Remove
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
