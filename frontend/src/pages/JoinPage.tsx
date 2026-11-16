import { ChangeEvent, FormEvent, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { joinFamily } from '../api'
import AuthLayout from '../components/AuthLayout'
import FormField from '../components/FormField'
import type { JoinInput } from '../types'

interface JoinPageProps {
  onSignedIn: (accessToken: string) => Promise<unknown>
}

const ROLES: { value: JoinInput['role']; label: string }[] = [
  { value: 'parent', label: '🦸 Parent' },
  { value: 'child', label: '🌟 Kid' },
]

/** Join an existing family with its invite code, as a parent or a kid. */
export default function JoinPage({ onSignedIn }: JoinPageProps) {
  const [params] = useSearchParams()
  const [form, setForm] = useState<JoinInput>({
    invite_code: params.get('code') ?? '',
    role: 'parent',
    full_name: '',
    email: '',
    username: '',
    password: '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const update = (key: 'invite_code' | 'full_name' | 'email' | 'username' | 'password') => (event: ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [key]: event.target.value })

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { access_token } = await joinFamily({ ...form, username: form.username || undefined })
      await onSignedIn(access_token)
    } catch (err) {
      setError((err as Error).message)
      setLoading(false)
    }
  }

  return (
    <AuthLayout title="Join the family 🎟️" subtitle="Use the invite link from a grown-up in your family.">
      <form className="mt-6 space-y-4" onSubmit={handleSubmit} aria-label="Join a family">
        <FormField
          id="invite-code"
          label="Invite code"
          required
          autoCapitalize="characters"
          autoComplete="off"
          value={form.invite_code}
          onChange={update('invite_code')}
        />
        <fieldset>
          <legend className="label">I'm joining as</legend>
          <div className="grid grid-cols-2 gap-2">
            {ROLES.map((role) => (
              <label key={role.value} className="choice">
                <input
                  type="radio"
                  name="join-role"
                  className="sr-only"
                  checked={form.role === role.value}
                  onChange={() => setForm({ ...form, role: role.value })}
                />
                {role.label}
              </label>
            ))}
          </div>
        </fieldset>
        <FormField id="join-full-name" label="Your name" required maxLength={100} value={form.full_name} onChange={update('full_name')} />
        <FormField id="join-email" type="email" autoComplete="email" label="Email" required value={form.email} onChange={update('email')} />
        <FormField
          id="join-username"
          label="Username (optional)"
          autoComplete="username"
          autoCapitalize="none"
          value={form.username}
          onChange={update('username')}
        />
        <FormField
          id="join-password"
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
          {loading ? '🚀 Joining…' : '🎟️ Join the family'}
        </button>
      </form>
      <p className="mt-4 text-center text-grape-700">
        No invite? <Link to="/signup" className="font-semibold text-grape-600 underline underline-offset-4">Start a new family</Link>
      </p>
      <p className="mt-2 text-center">
        <Link to="/login" className="font-semibold text-grape-600 underline underline-offset-4">
          Back to sign in
        </Link>
      </p>
    </AuthLayout>
  )
}
