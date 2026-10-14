import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App, { TOKEN_KEY } from './App'
import { getMe, login, setAuthToken, setUnauthorizedHandler } from './api'
import { admin, mia, parent } from './test/fixtures'

vi.mock('./api', () => ({
  getMe: vi.fn(),
  login: vi.fn(),
  setAuthToken: vi.fn(),
  setUnauthorizedHandler: vi.fn(),
  forgotPassword: vi.fn(),
  resetPasswordWithToken: vi.fn(),
}))
vi.mock('./pages/ParentDashboard', () => ({ default: ({ onLogout }: { onLogout: () => void }) => <button onClick={onLogout}>parent page</button> }))
vi.mock('./pages/ChildDashboard', () => ({ default: () => <p>child page</p> }))
vi.mock('./pages/AdminPage', () => ({ default: () => <p>admin page</p> }))

const visit = (path: string) => window.history.pushState({}, '', path)

describe('App', () => {
  beforeEach(() => {
    localStorage.clear()
    visit('/')
  })

  it('sends visitors without a token to the login page', async () => {
    visit('/parent')
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Welcome back! 👋' })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/login')
    expect(getMe).not.toHaveBeenCalled()
  })

  it('signs in and lands on the role home page', async () => {
    vi.mocked(login).mockResolvedValue({ access_token: 'tok' })
    vi.mocked(getMe).mockResolvedValue(mia)
    visit('/login')
    render(<App />)
    await userEvent.type(await screen.findByLabelText('Username or email'), 'mia')
    await userEvent.type(screen.getByLabelText('Password'), 'secret')
    await userEvent.click(screen.getByRole('button', { name: "🚀 Let's go!" }))
    expect(await screen.findByText('child page')).toBeInTheDocument()
    expect(localStorage.getItem(TOKEN_KEY)).toBe('tok')
    expect(setAuthToken).toHaveBeenCalledWith('tok')
    expect(window.location.pathname).toBe('/child')
  })

  it('restores a saved session and logs out', async () => {
    localStorage.setItem(TOKEN_KEY, 'saved')
    vi.mocked(getMe).mockResolvedValue(parent)
    render(<App />)
    expect(screen.getByText(/Loading/)).toBeInTheDocument()
    await userEvent.click(await screen.findByText('parent page'))
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull()
    expect(setAuthToken).toHaveBeenLastCalledWith(null)
    expect(await screen.findByRole('heading', { name: 'Welcome back! 👋' })).toBeInTheDocument()
  })

  it('keeps users on pages for their own role', async () => {
    localStorage.setItem(TOKEN_KEY, 'saved')
    vi.mocked(getMe).mockResolvedValue(admin)
    visit('/child')
    render(<App />)
    expect(await screen.findByText('admin page')).toBeInTheDocument()
    expect(window.location.pathname).toBe('/admin')
  })

  it('redirects signed-in users away from public pages', async () => {
    localStorage.setItem(TOKEN_KEY, 'saved')
    vi.mocked(getMe).mockResolvedValue(mia)
    visit('/forgot-password')
    render(<App />)
    expect(await screen.findByText('child page')).toBeInTheDocument()
  })

  it('drops an expired token and registers the 401 handler', async () => {
    localStorage.setItem(TOKEN_KEY, 'expired')
    vi.mocked(getMe).mockRejectedValue(new Error('Could not validate credentials'))
    visit('/reset-password?token=x')
    render(<App />)
    expect(await screen.findByRole('heading', { name: /Pick a new password/ })).toBeInTheDocument()
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull()
    expect(setUnauthorizedHandler).toHaveBeenCalledWith(expect.any(Function))
  })

  it('shows the forgot password page to visitors', async () => {
    visit('/forgot-password')
    render(<App />)
    expect(await screen.findByRole('heading', { name: /Forgot your password/ })).toBeInTheDocument()
  })
})
