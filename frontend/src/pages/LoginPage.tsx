import { FormEvent, useState } from 'react'
import { Link } from 'react-router-dom'
import AuthLayout from '../components/AuthLayout'

interface LoginPageProps {
  onLogin: (username: string, password: string) => Promise<unknown>
}

export default function LoginPage({ onLogin }: LoginPageProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setLoading(true)
    try {
      await onLogin(username, password)
    } catch (err) {
      setError((err as Error).message)
      setLoading(false)
    }
  }

  return (
    <AuthLayout title="Welcome back! 👋" subtitle="Sign in to see today's missions.">
      <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
        <div>
          <label className="label" htmlFor="username">
            Username or email
          </label>
          <input
            id="username"
            autoComplete="username"
            autoCapitalize="none"
            required
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            className="input"
          />
        </div>
        <div>
          <label className="label" htmlFor="password">
            Password
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="input pr-14"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute inset-y-0 right-2 my-auto h-10 w-10 rounded-full text-xl hover:bg-grape-50"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? '🙈' : '👀'}
            </button>
          </div>
        </div>
        {error && (
          <p role="alert" className="rounded-2xl bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-600">
            {error}
          </p>
        )}
        <button type="submit" disabled={loading} className="btn-primary w-full text-lg">
          {loading ? '🚀 Signing in…' : "🚀 Let's go!"}
        </button>
        <p className="text-center">
          <Link to="/forgot-password" className="font-semibold text-grape-600 underline decoration-wavy decoration-bubble-400 underline-offset-4">
            Forgot your password?
          </Link>
        </p>
      </form>
    </AuthLayout>
  )
}
