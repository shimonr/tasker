import type { Badge } from '../types'

/** Every badge: earned ones in full colour, locked ones grey. */
export default function BadgeGrid({ badges }: { badges: Badge[] }) {
  return (
    <ul className="grid grid-cols-3 gap-3 sm:grid-cols-6" aria-label="Badges">
      {badges.map((badge) => (
        <li
          key={badge.key}
          className={`flex flex-col items-center rounded-3xl border-2 px-2 py-3 text-center ${
            badge.earned ? 'border-sunny-300 bg-sunny-50' : 'border-grape-100 bg-grape-50 opacity-60 grayscale'
          }`}
        >
          <span className="text-3xl" aria-hidden="true">
            {badge.emoji}
          </span>
          <span className="mt-1 text-sm font-bold text-grape-900">{badge.title}</span>
          <span className="text-xs font-semibold text-grape-700">{badge.earned ? '✅ Earned!' : '🔒 Locked'}</span>
        </li>
      ))}
    </ul>
  )
}
