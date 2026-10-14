import type { User } from '../types'
import { userName } from '../lib/tasks'

const ROLE_BADGE = { admin: '🛡️ Admin', parent: '🦸 Parent', child: '🌟 Explorer' }

interface NavbarProps {
  user: User
  onLogout: () => void
}

export default function Navbar({ user, onLogout }: NavbarProps) {
  return (
    <header className="sticky top-0 z-40 -mx-4 mb-6 border-b-4 border-white/70 bg-white/95 px-4 py-3 backdrop-blur-md sm:mx-0 sm:mt-4 sm:rounded-[28px] sm:border-4 sm:px-6 sm:shadow-chunky">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="animate-wiggle text-3xl sm:text-4xl" aria-hidden="true">
            🎈
          </span>
          <div className="min-w-0">
            <p className="truncate text-xs font-bold uppercase tracking-[0.2em] text-bubble-500 sm:text-sm">Family Task Adventure</p>
            <p className="truncate text-lg font-bold text-grape-900 sm:text-xl">
              {userName(user)} <span className="hidden text-sm font-semibold text-grape-400 sm:inline">· {ROLE_BADGE[user.role]}</span>
            </p>
          </div>
        </div>
        <button onClick={onLogout} className="btn-ghost btn-sm shrink-0" aria-label="Log out">
          👋 <span className="hidden sm:inline">Log out</span>
        </button>
      </div>
    </header>
  )
}
