import { FormEvent, useState } from 'react'
import { useNavigate } from 'react-router-dom'

interface LoginPageProps {
  onLogin: (username: string, password: string) => Promise<any>
}

export default function LoginPage({ onLogin }: LoginPageProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const navigate = useNavigate()

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const me = await onLogin(username, password)
      setSuccess(true)
      setTimeout(() => {
        const target = me.role === 'parent' ? '/parent' : me.role === 'child' ? '/child' : '/admin'
        navigate(target)
      }, 600)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed. Please check your username and password.'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-xl shadow-slate-200">
        <h1 className="text-3xl font-semibold text-slate-900">Family Task Manager</h1>
        <p className="mt-2 text-slate-600">Sign in to manage household tasks.</p>
        <div className="mt-4 rounded-3xl bg-kids-100 p-4 text-kids-900 shadow-inner shadow-kids-200">
          <p className="text-sm font-medium">Fun chores, prizes, and team play!</p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4">
            <label className="block text-sm font-medium text-slate-700">
              Username
              <input
                type="text"
                required
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className="mt-2 block w-full rounded-2xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Password
              <input
                type="password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-2 block w-full rounded-2xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              />
            </label>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full inline-flex items-center justify-center gap-3 rounded-2xl bg-brand-500 px-4 py-3 text-white transition hover:bg-brand-600 disabled:opacity-60"
          >
            {loading ? (
              <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
            ) : null}
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
          {success && <div className="mt-3 rounded-md bg-emerald-50 p-3 text-emerald-700">Login successful — redirecting...</div>}
        </form>
      </div>
    </main>
  )
}
