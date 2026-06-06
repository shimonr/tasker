import { ReactNode } from 'react'

interface NavbarProps {
  title: string
  actions?: ReactNode
}

export default function Navbar({ title, actions }: NavbarProps) {
  return (
    <header className="mb-6 flex flex-col gap-4 rounded-3xl bg-white p-6 shadow-lg shadow-slate-200 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm uppercase tracking-[0.2em] text-kids-700">Family Task Adventure</p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-900">{title}</h1>
      </div>
      <div>{actions}</div>
    </header>
  )
}
