import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { forgotPassword, resetPasswordWithToken } from '../api'
import ForgotPasswordPage from './ForgotPasswordPage'
import LoginPage from './LoginPage'
import ResetPasswordPage from './ResetPasswordPage'

vi.mock('../api', () => ({ forgotPassword: vi.fn(), resetPasswordWithToken: vi.fn() }))

const inRouter = (ui: JSX.Element, path = '/') => render(<MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>)

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
