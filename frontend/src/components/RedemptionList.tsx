import type { Redemption } from '../types'
import { formatDate } from '../lib/tasks'

interface RedemptionListProps {
  redemptions: Redemption[]
  emptyText: string
  /** Shown to a parent: lists every kid's requests and lets them mark one as handed over. */
  onFulfill?: (redemptionId: number) => void
}

/** Reward requests, newest first. Parents see who asked and can fulfil; kids see their own progress. */
export default function RedemptionList({ redemptions, emptyText, onFulfill }: RedemptionListProps) {
  if (redemptions.length === 0) return <p className="rounded-2xl bg-grape-50 px-4 py-3 text-grape-700">{emptyText}</p>
  return (
    <ul className="space-y-3" aria-label={onFulfill ? 'Reward requests' : 'My rewards'}>
      {redemptions.map((redemption) => (
        <li key={redemption.id} className="flex flex-wrap items-center gap-3 rounded-2xl bg-grape-50/60 px-4 py-3">
          <span className="text-2xl" aria-hidden="true">
            {redemption.reward_emoji || '🎁'}
          </span>
          <div className="min-w-0 flex-1">
            <p className="break-words font-bold text-grape-900">{redemption.reward_name}</p>
            <p className="text-sm text-grape-700">
              {onFulfill && `${redemption.child_name} · `}⭐ {redemption.cost} · {formatDate(redemption.created_at)}
            </p>
          </div>
          {redemption.status === 'fulfilled' ? (
            <span className="chip bg-leaf-100 text-leaf-600">{onFulfill ? '🎉 Handed over' : '🎉 Got it!'}</span>
          ) : onFulfill ? (
            <button type="button" className="btn-success btn-sm" onClick={() => onFulfill(redemption.id)}>
              ✅ Fulfill
            </button>
          ) : (
            <span className="chip bg-sunny-100 text-sunny-500">⏳ Waiting for a grown-up</span>
          )}
        </li>
      ))}
    </ul>
  )
}
