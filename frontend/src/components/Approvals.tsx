import { dayLabel, type PendingApproval } from '../lib/tasks'

interface ApprovalsProps {
  items: PendingApproval[]
  onDecide: (item: PendingApproval, approve: boolean) => void
}

/** Kids' finished tasks that wait for a grown-up. Renders nothing when there are none. */
export default function Approvals({ items, onDecide }: ApprovalsProps) {
  if (items.length === 0) return null
  return (
    <section className="card mb-6 border-sunny-300 bg-sunny-50" aria-labelledby="approvals-heading">
      <h2 id="approvals-heading" className="text-2xl text-grape-900">
        🛎️ Waiting for your yes ({items.length})
      </h2>
      <ul className="mt-4 space-y-3">
        {items.map((item) => (
          <li key={item.key} className="flex flex-col gap-3 rounded-2xl bg-white px-4 py-3 sm:flex-row sm:items-center">
            <div className="min-w-0 sm:flex-1">
              <p className="break-words font-bold text-grape-900">
                {item.who} says “{item.title}” is done
              </p>
              {item.kind === 'occurrence' && (
                <p className="text-sm text-grape-700">{dayLabel(item.date, { weekday: 'short', month: 'short', day: 'numeric' })}</p>
              )}
            </div>
            <div className="flex shrink-0 gap-2">
              <button type="button" className="btn-success btn-sm" onClick={() => onDecide(item, true)}>
                ✅ Approve
              </button>
              <button type="button" className="btn-ghost btn-sm" onClick={() => onDecide(item, false)}>
                ✖️ Reject
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
