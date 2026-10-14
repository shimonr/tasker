import { FormEvent, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { resetPasswordWithToken } from '../api'
import AuthLayout from '../components/AuthLayout'

export default function ResetPasswordPage() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState(token ? '' : 'This reset link is missing its token. Please request a new one.')
  const [done, setDone] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (password !== confirm) {
      setError("The passwords don't match.")
      return
    }
    setError('')
    try {
      await resetPasswordWithToken(token, password)
      setDone(true)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <AuthLayout title="Pick a new password 🔐" subtitle="Make it at least 8 characters long.">
      {done ? (
        <p role="status" className="mt-6 rounded-2xl bg-leaf-50 px-4 py-3 text-center font-semibold text-leaf-600">
          🎉 Password updated! You can sign in now.
        </p>
      ) : (
        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="label" htmlFor="new-password">
              New password
            </label>
            <input
              id="new-password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input"
            />
          </div>
          <div>
            <label className="label" htmlFor="confirm-password">
              Type it again
            </label>
            <input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="input"
            />
          </div>
          {error && (
            <p role="alert" className="rounded-2xl bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-600">
              {error}
            </p>
          )}
          <button type="submit" disabled={!token} className="btn-primary w-full">
            💾 Save password
          </button>
        </form>
      )}
      <p className="mt-4 text-center">
        <Link to="/login" className="font-semibold text-grape-600 underline underline-offset-4">
          Go to sign in
        </Link>
      </p>
    </AuthLayout>
  )
}
