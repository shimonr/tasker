import type { ReactNode } from 'react'

/** Shared playful frame for the sign-in style pages. */
export default function AuthLayout({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-4 flex justify-center gap-3 text-5xl" aria-hidden="true">
          <span className="animate-floaty">🎈</span>
          <span className="animate-floaty [animation-delay:600ms]">🦄</span>
          <span className="animate-floaty [animation-delay:1200ms]">⭐</span>
        </div>
        <div className="card border-bubble-200">
          <p className="text-center text-sm font-bold uppercase tracking-[0.2em] text-bubble-500">Family Task Adventure</p>
          <h1 className="mt-1 text-center text-3xl text-grape-900">{title}</h1>
          <p className="mt-2 text-center text-grape-700">{subtitle}</p>
          {children}
        </div>
      </div>
    </main>
  )
}
