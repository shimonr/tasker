import { FormEvent, useState } from 'react'
import { resendVerification } from '../api'
import FormField from './FormField'

/** Asks for a fresh confirmation link. The reply reads the same whether or not the account exists. */
export default function ResendVerification({ initialEmail = '' }: { initialEmail?: string }) {
  const [email, setEmail] = useState(initialEmail)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    try {
      setMessage((await resendVerification(email)).message)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  if (message) {
    return (
      <p role="status" className="rounded-2xl bg-leaf-50 px-4 py-3 text-center font-semibold text-leaf-600">
        📬 {message}
      </p>
    )
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit} aria-label="Send a new link">
      <FormField id="resend-email" type="email" autoComplete="email" label="Email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      {error && (
        <p role="alert" className="rounded-2xl bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-600">
          {error}
        </p>
      )}
      <button type="submit" className="btn-success w-full">
        ✨ Send a new link
      </button>
    </form>
  )
}
