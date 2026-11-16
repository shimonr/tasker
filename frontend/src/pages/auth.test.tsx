import { StrictMode } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { forgotPassword, resendVerification, resetPasswordWithToken, verifyEmail } from '../api'
import ForgotPasswordPage from './ForgotPasswordPage'
import LoginPage from './LoginPage'
import ResetPasswordPage from './ResetPasswordPage'
import VerifyEmailPage from './VerifyEmailPage'

vi.mock('../api', () => ({ forgotPassword: vi.fn(), resetPasswordWithToken: vi.fn(), resendVerification: vi.fn(), verifyEmail: vi.fn() }))

const inRouter = (ui: JSX.Element, path = '/') => render(<MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>)

/** The API's reply when a password is right but the email is not confirmed yet. */
const notConfirmed = () => Object.assign(new Error('Please confirm your email first. Check your inbox for the link.'), { status: 403 })

describe('LoginPage', () => {
  it('submits credentials, toggles password visibility and shows errors', async () => {
    const onLogin = vi.fn().mockRejectedValueOnce(new Error('Incorrect user or password')).mockReturnValue(new Promise(() => {}))
    inRouter(<LoginPage onLogin={onLogin} />)
    await userEvent.type(screen.getByLabelText('Username or email'), 'mia')
    await userEvent.type(screen.getByLabelText('Password'), 'secret')
    await userEvent.click(screen.getByRole('button', { name: 'Show password' }))
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'text')
    await userEvent.click(screen.getByRole('button', { name: 'Hide password' }))
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password')

    await userEvent.click(screen.getByRole('button', { name: "🚀 Let's go!" }))
    expect(onLogin).toHaveBeenCalledWith('mia', 'secret')
    expect(screen.getByRole('alert')).toHaveTextContent('Incorrect user or password')

    await userEvent.click(screen.getByRole('button', { name: "🚀 Let's go!" }))
    expect(screen.getByRole('button', { name: '🚀 Signing in…' })).toBeDisabled()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Forgot your password?' })).toHaveAttribute('href', '/forgot-password')
    expect(screen.getByRole('link', { name: 'Create a family' })).toHaveAttribute('href', '/signup')
  })

  it('offers a new confirmation link when the email is not confirmed yet', async () => {
    const onLogin = vi.fn().mockRejectedValueOnce(notConfirmed()).mockReturnValue(new Promise(() => {}))
    vi.mocked(resendVerification).mockResolvedValueOnce({ message: 'If that account needs confirming, a new link is on its way.' })
    inRouter(<LoginPage onLogin={onLogin} />)
    await userEvent.type(screen.getByLabelText('Username or email'), 'mia@example.com')
    await userEvent.type(screen.getByLabelText('Password'), 'secret')
    await userEvent.click(screen.getByRole('button', { name: "🚀 Let's go!" }))
    expect(screen.getByRole('alert')).toHaveTextContent('Please confirm your email first. Check your inbox for the link.')

    await userEvent.click(screen.getByRole('button', { name: '📨 Send me a new link' }))
    expect(screen.queryByRole('button', { name: '📨 Send me a new link' })).not.toBeInTheDocument()
    const form = screen.getByRole('form', { name: 'Send a new link' })
    expect(within(form).getByLabelText('Email')).toHaveValue('mia@example.com')
    await userEvent.click(within(form).getByRole('button', { name: '✨ Send a new link' }))
    expect(resendVerification).toHaveBeenCalledWith('mia@example.com')
    expect(await screen.findByRole('status')).toHaveTextContent('If that account needs confirming')
  })

  it('keeps other sign-in errors as they are', async () => {
    const onLogin = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('Your account is paused'), { status: 403 }))
      .mockRejectedValueOnce(Object.assign(new Error('Please confirm your email first.'), { status: 401 }))
    inRouter(<LoginPage onLogin={onLogin} />)
    await userEvent.type(screen.getByLabelText('Username or email'), 'mia')
    await userEvent.type(screen.getByLabelText('Password'), 'secret')
    await userEvent.click(screen.getByRole('button', { name: "🚀 Let's go!" }))
    expect(screen.getByRole('alert')).toHaveTextContent('Your account is paused')
    expect(screen.queryByRole('button', { name: '📨 Send me a new link' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: "🚀 Let's go!" }))
    expect(screen.getByRole('alert')).toHaveTextContent('Please confirm your email first.')
    expect(screen.queryByRole('button', { name: '📨 Send me a new link' })).not.toBeInTheDocument()
  })
})

describe('VerifyEmailPage', () => {
  it('confirms the email from the link and offers to sign in', async () => {
    vi.mocked(verifyEmail).mockResolvedValue({ message: 'Your email is confirmed. You can sign in now.' })
    inRouter(<VerifyEmailPage />, '/verify-email?token=abc')
    expect(screen.getByRole('heading', { name: 'Confirming your email ✉️' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Your email is confirmed 🎉' })).toBeInTheDocument()
    expect(verifyEmail).toHaveBeenCalledWith('abc')
    expect(screen.getByRole('link', { name: '🚀 Sign in' })).toHaveAttribute('href', '/login')
    expect(screen.queryByRole('form', { name: 'Send a new link' })).not.toBeInTheDocument()
  })

  it('uses the link only once, even when React runs effects twice', async () => {
    vi.mocked(verifyEmail).mockResolvedValue({ message: 'Your email is confirmed. You can sign in now.' })
    render(
      <StrictMode>
        <MemoryRouter initialEntries={['/verify-email?token=abc']}>
          <VerifyEmailPage />
        </MemoryRouter>
      </StrictMode>,
    )
    expect(await screen.findByRole('heading', { name: 'Your email is confirmed 🎉' })).toBeInTheDocument()
    expect(verifyEmail).toHaveBeenCalledTimes(1)
  })

  it('explains a failed link and sends a new one', async () => {
    vi.mocked(verifyEmail).mockRejectedValue(new Error('This link is invalid or has expired.'))
    vi.mocked(resendVerification).mockRejectedValueOnce(new Error('Too many requests. Try again later.')).mockResolvedValueOnce({
      message: 'If that account needs confirming, a new link is on its way.',
    })
    inRouter(<VerifyEmailPage />, '/verify-email?token=old')
    expect(await screen.findByRole('alert')).toHaveTextContent('This link is invalid or has expired.')
    expect(screen.getByRole('heading', { name: "That link didn't work 🙈" })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to sign in' })).toHaveAttribute('href', '/login')

    const form = screen.getByRole('form', { name: 'Send a new link' })
    await userEvent.type(within(form).getByLabelText('Email'), 'mom@example.com')
    await userEvent.click(within(form).getByRole('button', { name: '✨ Send a new link' }))
    expect(within(form).getByRole('alert')).toHaveTextContent('Too many requests')
    await userEvent.click(within(form).getByRole('button', { name: '✨ Send a new link' }))
    expect(resendVerification).toHaveBeenLastCalledWith('mom@example.com')
    expect(await screen.findByRole('status')).toHaveTextContent('If that account needs confirming')
    expect(screen.queryByRole('form', { name: 'Send a new link' })).not.toBeInTheDocument()
  })

  it('shows the resend form straight away when the link has no token', () => {
    inRouter(<VerifyEmailPage />, '/verify-email')
    expect(screen.getByRole('heading', { name: 'Confirm your email ✉️' })).toBeInTheDocument()
    expect(screen.getByRole('form', { name: 'Send a new link' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(verifyEmail).not.toHaveBeenCalled()
  })
})

describe('ForgotPasswordPage', () => {
  it('requests a reset link', async () => {
    vi.mocked(forgotPassword).mockRejectedValueOnce(new Error('Too many')).mockResolvedValueOnce({ message: 'Check your inbox' })
    inRouter(<ForgotPasswordPage />)
    await userEvent.type(screen.getByLabelText('Email'), 'mia@example.com')
    await userEvent.click(screen.getByRole('button', { name: '✨ Send reset link' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Too many')
    await userEvent.click(screen.getByRole('button', { name: '✨ Send reset link' }))
    expect(forgotPassword).toHaveBeenLastCalledWith('mia@example.com')
    expect(screen.getByRole('status')).toHaveTextContent('Check your inbox')
  })
})

describe('ResetPasswordPage', () => {
  it('sets a new password with the token from the link', async () => {
    vi.mocked(resetPasswordWithToken).mockRejectedValueOnce(new Error('This reset link is invalid')).mockResolvedValueOnce({ message: 'ok' })
    inRouter(<ResetPasswordPage />, '/reset-password?token=abc')
    await userEvent.type(screen.getByLabelText('New password'), 'new-secret-1')
    await userEvent.type(screen.getByLabelText('Type it again'), 'different')
    await userEvent.click(screen.getByRole('button', { name: '💾 Save password' }))
    expect(screen.getByRole('alert')).toHaveTextContent("don't match")
    expect(resetPasswordWithToken).not.toHaveBeenCalled()

    await userEvent.clear(screen.getByLabelText('Type it again'))
    await userEvent.type(screen.getByLabelText('Type it again'), 'new-secret-1')
    await userEvent.click(screen.getByRole('button', { name: '💾 Save password' }))
    expect(screen.getByRole('alert')).toHaveTextContent('invalid')
    await userEvent.click(screen.getByRole('button', { name: '💾 Save password' }))
    expect(resetPasswordWithToken).toHaveBeenLastCalledWith('abc', 'new-secret-1')
    expect(screen.getByRole('status')).toHaveTextContent('Password updated')
  })

  it('explains a link without a token', () => {
    inRouter(<ResetPasswordPage />, '/reset-password')
    expect(screen.getByRole('alert')).toHaveTextContent('missing its token')
    expect(screen.getByRole('button', { name: '💾 Save password' })).toBeDisabled()
  })
})
