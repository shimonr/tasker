import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { verifyEmail } from '../api'
import AuthLayout from '../components/AuthLayout'
import ResendVerification from '../components/ResendVerification'

type Stage = 'checking' | 'confirmed' | 'failed' | 'resend'

const TITLES: Record<Stage, string> = {
  checking: 'Confirming your email ✉️',
  confirmed: 'Your email is confirmed 🎉',
  failed: "That link didn't work 🙈",
  resend: 'Confirm your email ✉️',
}

const SUBTITLES: Record<Stage, string> = {
  checking: 'Just a moment…',
  confirmed: 'Welcome to the adventure!',
  failed: 'No worries, we can send you a fresh one.',
  resend: "Enter the email you signed up with and we'll send a new link.",
}

/** Confirms the email from the sign-up link. Failed or missing links get a form to send a new one. */
export default function VerifyEmailPage() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const [stage, setStage] = useState<Stage>(token ? 'checking' : 'resend')
  const [error, setError] = useState('')
  const started = useRef(false)

  useEffect(() => {
    // Links work once, and StrictMode runs effects twice in development, so confirm only on the first run.
    if (!token || started.current) return
    started.current = true
    verifyEmail(token)
      .then(() => setStage('confirmed'))
      .catch((err: Error) => {
        setError(err.message)
        setStage('failed')
      })
  }, [token])

  return (
    <AuthLayout title={TITLES[stage]} subtitle={SUBTITLES[stage]}>
      {stage === 'confirmed' && (
        <div className="mt-6 space-y-4">
          <p role="status" className="rounded-2xl bg-leaf-50 px-4 py-3 text-center font-semibold text-leaf-600">
            🎉 You can sign in now.
          </p>
          <Link to="/login" className="btn-primary w-full text-lg">
            🚀 Sign in
          </Link>
        </div>
      )}
      {stage === 'failed' && (
        <p role="alert" className="mt-6 rounded-2xl bg-rose-50 px-4 py-2 text-center text-sm font-semibold text-rose-600">
          {error}
        </p>
      )}
      {(stage === 'failed' || stage === 'resend') && (
        <div className="mt-6">
          <ResendVerification />
        </div>
      )}
      <p className="mt-4 text-center">
        <Link to="/login" className="font-semibold text-grape-600 underline underline-offset-4">
          Back to sign in
        </Link>
      </p>
    </AuthLayout>
  )
}
