import type { Reward } from '../types'

interface RewardShopProps {
  rewards: Reward[]
  balance: number
  onRedeem: (reward: Reward) => void
}

/** Active rewards the kid can buy with the stars they have left to spend. */
export default function RewardShop({ rewards, balance, onRedeem }: RewardShopProps) {
  if (rewards.length === 0) {
    return <p className="rounded-2xl bg-grape-50 px-4 py-3 text-grape-700">The shop is empty for now. Ask a grown-up to stock it! 🛍️</p>
  }
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {rewards.map((reward) => {
        const missing = reward.cost - balance
        return (
          <li key={reward.id} className="flex flex-col gap-3 rounded-3xl border-2 border-sunny-200 bg-white p-4">
            <div className="flex items-center gap-3">
              <span className="text-4xl" aria-hidden="true">
                {reward.emoji || '🎁'}
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="break-words text-lg text-grape-900">{reward.name}</h3>
                <span className="chip mt-1 bg-sunny-200 text-grape-900">⭐ {reward.cost}</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-semibold text-grape-700">
                {missing > 0 ? `Save up ${missing} more ${missing === 1 ? 'star' : 'stars'} for this one!` : 'Ready to redeem! 🎉'}
              </p>
              <button type="button" className="btn-success btn-sm" disabled={missing > 0} aria-label={`Redeem ${reward.name}`} onClick={() => onRedeem(reward)}>
                🎁 Redeem
              </button>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
