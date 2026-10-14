import { FormEvent, useState } from 'react'
import { Link } from 'react-router-dom'
import { forgotPassword } from '../api'
import AuthLayout from '../components/AuthLayout'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    try {
      setMessage((await forgotPassword(email)).message)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <AuthLayout title="Forgot your password? 🔑" subtitle="No worries! We'll email you a magic link.">
      {message ? (
        <p role="status" className="mt-6 rounded-2xl bg-leaf-50 px-4 py-3 text-center font-semibold text-leaf-600">
          📬 {message}
        </p>
      ) : (
        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="label" htmlFor="email">
              Email
            </label>
            <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="input" />
          </div>
          {error && (
            <p role="alert" className="rounded-2xl bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-600">
              {error}
            </p>
          )}
          <button type="submit" className="btn-primary w-full">
            ✨ Send reset link
          </button>
        </form>
      )}
      <p className="mt-4 text-center">
        <Link to="/login" className="font-semibold text-grape-600 underline underline-offset-4">
          Back to sign in
        </Link>
      </p>
    </AuthLayout>
  )
}
