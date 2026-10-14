import type { CSSProperties } from 'react'

const COLORS = ['#ff4fa0', '#ffd43b', '#4dc0ff', '#6fdc3b', '#a67cff', '#ff922b']

/** A one-shot confetti shower. Remount it (change its key) to fire again. */
export default function Confetti() {
  return (
    <div aria-hidden="true" data-testid="confetti" className="pointer-events-none fixed inset-x-0 top-0 z-[70] h-0">
      {Array.from({ length: 36 }, (_, i) => (
        <span
          key={i}
          className="absolute top-0 block h-3 w-2 animate-confetti rounded-sm"
          style={
            {
              left: `${(i * 37) % 100}%`,
              backgroundColor: COLORS[i % COLORS.length],
              animationDelay: `${(i % 6) * 60}ms`,
              '--dx': `${((i * 53) % 120) - 60}px`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  )
}
