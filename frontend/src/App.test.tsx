import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App, { TOKEN_KEY } from './App'
import { getMe, joinFamily, login, setAuthToken, setUnauthorizedHandler, signup } from './api'
import { admin, mia, parent } from './test/fixtures'

vi.mock('./api', () => ({
  getMe: vi.fn(),
  login: vi.fn(),
  setAuthToken: vi.fn(),
  setUnauthorizedHandler: vi.fn(),
  forgotPassword: vi.fn(),
  resetPasswordWithToken: vi.fn(),
  signup: vi.fn(),
  joinFamily: vi.fn(),
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
    vi.mocked(login).mockResolvedValue({ access_token: 'tok', token_type: 'bearer' })
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

  it('signs up a new family and stores the token the same way login does', async () => {
    vi.mocked(signup).mockResolvedValue({ access_token: 'new-family', token_type: 'bearer' })
    vi.mocked(getMe).mockResolvedValue(parent)
    visit('/signup')
    render(<App />)
    await userEvent.type(await screen.findByLabelText('Family name'), 'The Riveras')
    await userEvent.type(screen.getByLabelText('Your name'), 'Mom Rivera')
    await userEvent.type(screen.getByLabelText('Email'), 'mom@example.com')
    await userEvent.type(screen.getByLabelText('Password (8+ characters)'), 'long-password')
    await userEvent.click(screen.getByRole('button', { name: '🏡 Create our family' }))
    expect(await screen.findByText('parent page')).toBeInTheDocument()
    expect(localStorage.getItem(TOKEN_KEY)).toBe('new-family')
    expect(setAuthToken).toHaveBeenCalledWith('new-family')
    expect(window.location.pathname).toBe('/parent')
  })

  it('joins a family from an invite link as a kid', async () => {
    vi.mocked(joinFamily).mockResolvedValue({ access_token: 'joined', token_type: 'bearer' })
    vi.mocked(getMe).mockResolvedValue(mia)
    visit('/join?code=ABC123')
    render(<App />)
    expect(await screen.findByLabelText('Invite code')).toHaveValue('ABC123')
    await userEvent.click(screen.getByLabelText('🌟 Kid'))
    await userEvent.type(screen.getByLabelText('Your name'), 'Mia')
    await userEvent.type(screen.getByLabelText('Email'), 'mia@example.com')
    await userEvent.type(screen.getByLabelText('Password (8+ characters)'), 'long-password')
    await userEvent.click(screen.getByRole('button', { name: '🎟️ Join the family' }))
    expect(await screen.findByText('child page')).toBeInTheDocument()
    expect(joinFamily).toHaveBeenCalledWith(expect.objectContaining({ invite_code: 'ABC123', role: 'child' }))
    expect(localStorage.getItem(TOKEN_KEY)).toBe('joined')
    expect(window.location.pathname).toBe('/child')
  })
})
