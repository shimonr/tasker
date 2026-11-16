import { ChangeEvent, FormEvent, useState } from 'react'
import { Link } from 'react-router-dom'
import { signup } from '../api'
import AuthLayout from '../components/AuthLayout'
import FormField from '../components/FormField'
import type { SignupInput } from '../types'

interface SignupPageProps {
  onSignedIn: (accessToken: string) => Promise<unknown>
}

const BLANK: SignupInput = { family_name: '', full_name: '', email: '', username: '', password: '' }

/** Create a new family and its first parent account, then sign in. */
export default function SignupPage({ onSignedIn }: SignupPageProps) {
  const [form, setForm] = useState(BLANK)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const update = (key: keyof SignupInput) => (event: ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: event.target.value })

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { access_token } = await signup({ ...form, username: form.username || undefined })
      await onSignedIn(access_token)
    } catch (err) {
      setError((err as Error).message)
      setLoading(false)
    }
  }

  return (
    <AuthLayout title="Start a family adventure 🏡" subtitle="Make your family, then invite the rest of the crew.">
      <form className="mt-6 space-y-4" onSubmit={handleSubmit} aria-label="Create a family">
        <FormField id="family-name" label="Family name" required maxLength={60} value={form.family_name} onChange={update('family_name')} placeholder="e.g. The Riveras" />
        <FormField id="signup-full-name" label="Your name" required maxLength={100} value={form.full_name} onChange={update('full_name')} />
        <FormField id="signup-email" type="email" autoComplete="email" label="Email" required value={form.email} onChange={update('email')} />
        <FormField
          id="signup-username"
          label="Username (optional)"
          autoComplete="username"
          autoCapitalize="none"
          value={form.username}
          onChange={update('username')}
        />
        <FormField
          id="signup-password"
          type="password"
          label="Password (8+ characters)"
          autoComplete="new-password"
          minLength={8}
          maxLength={128}
          required
          value={form.password}
          onChange={update('password')}
        />
        {error && (
          <p role="alert" className="rounded-2xl bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-600">
            {error}
          </p>
        )}
        <button type="submit" disabled={loading} className="btn-primary w-full text-lg">
          {loading ? '🚀 Building your family…' : '🏡 Create our family'}
        </button>
      </form>
      <p className="mt-4 text-center text-grape-700">
        Got an invite from a family? <Link to="/join" className="font-semibold text-grape-600 underline underline-offset-4">Join it</Link>
      </p>
      <p className="mt-2 text-center">
        <Link to="/login" className="font-semibold text-grape-600 underline underline-offset-4">
          Back to sign in
        </Link>
      </p>
    </AuthLayout>
  )
}
