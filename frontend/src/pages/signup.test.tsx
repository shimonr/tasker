import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { joinFamily, signup } from '../api'
import { TOKEN_KEY } from '../App'
import JoinPage from './JoinPage'
import SignupPage from './SignupPage'

vi.mock('../api', () => ({ signup: vi.fn(), joinFamily: vi.fn() }))

const inRouter = (ui: JSX.Element, path = '/') => render(<MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>)

describe('SignupPage', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.mocked(signup).mockResolvedValue({ message: 'We sent a link to mom@example.com. Open it to finish signing up.' })
  })

  it('creates a family, then asks the parent to check their inbox without signing in', async () => {
    inRouter(<SignupPage />)
    expect(screen.getByRole('form', { name: 'Create a family' })).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Family name'), 'The Riveras')
    await userEvent.type(screen.getByLabelText('Your name'), 'Mom Rivera')
    await userEvent.type(screen.getByLabelText('Email'), 'mom@example.com')
    await userEvent.type(screen.getByLabelText('Password (8+ characters)'), 'long-password')
    await userEvent.click(screen.getByRole('button', { name: '🏡 Create our family' }))
    expect(signup).toHaveBeenCalledWith({
      family_name: 'The Riveras',
      full_name: 'Mom Rivera',
      email: 'mom@example.com',
      username: undefined,
      password: 'long-password',
    })
    expect(await screen.findByRole('heading', { name: 'Check your inbox' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('We sent a link to mom@example.com.')
    expect(screen.getByRole('status')).toHaveTextContent('Open the link in that email to finish')
    expect(screen.queryByRole('form', { name: 'Create a family' })).not.toBeInTheDocument()
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull()
  })

  it('shows the busy label while the family is being created', async () => {
    vi.mocked(signup).mockReturnValue(new Promise(() => {}))
    inRouter(<SignupPage />)
    await userEvent.type(screen.getByLabelText('Family name'), 'The Riveras')
    await userEvent.type(screen.getByLabelText('Your name'), 'Mom')
    await userEvent.type(screen.getByLabelText('Email'), 'mom@example.com')
    await userEvent.type(screen.getByLabelText('Password (8+ characters)'), 'long-password')
    await userEvent.click(screen.getByRole('button', { name: '🏡 Create our family' }))
    expect(screen.getByRole('button', { name: '🚀 Building your family…' })).toBeDisabled()
  })

  it('sends a username when one is given and shows errors so the form can be retried', async () => {
    vi.mocked(signup).mockRejectedValueOnce(new Error('Could not validate credentials'))
    inRouter(<SignupPage />)
    await userEvent.type(screen.getByLabelText('Family name'), 'The Riveras')
    await userEvent.type(screen.getByLabelText('Your name'), 'Mom')
    await userEvent.type(screen.getByLabelText('Email'), 'mom@example.com')
    await userEvent.type(screen.getByLabelText('Username (optional)'), 'mom')
    await userEvent.type(screen.getByLabelText('Password (8+ characters)'), 'long-password')
    await userEvent.click(screen.getByRole('button', { name: '🏡 Create our family' }))
    expect(signup).toHaveBeenLastCalledWith(expect.objectContaining({ username: 'mom' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not validate credentials')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '🏡 Create our family' })).toBeEnabled()
    await userEvent.click(screen.getByRole('button', { name: '🏡 Create our family' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Check your inbox')
    expect(signup).toHaveBeenCalledTimes(2)
  })

  it('links to joining and to signing in', () => {
    inRouter(<SignupPage />)
    expect(screen.getByRole('link', { name: 'Join it' })).toHaveAttribute('href', '/join')
    expect(screen.getByRole('link', { name: 'Back to sign in' })).toHaveAttribute('href', '/login')
  })

  it('keeps the sign-in link after the confirmation panel replaces the form', async () => {
    inRouter(<SignupPage />)
    await userEvent.type(screen.getByLabelText('Family name'), 'The Riveras')
    await userEvent.type(screen.getByLabelText('Your name'), 'Mom')
    await userEvent.type(screen.getByLabelText('Email'), 'mom@example.com')
    await userEvent.type(screen.getByLabelText('Password (8+ characters)'), 'long-password')
    await userEvent.click(screen.getByRole('button', { name: '🏡 Create our family' }))
    await screen.findByRole('status')
    expect(screen.queryByRole('link', { name: 'Join it' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to sign in' })).toHaveAttribute('href', '/login')
  })
})

describe('JoinPage', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.mocked(joinFamily).mockResolvedValue({ message: 'We sent a link to mia@example.com. Open it to finish signing up.' })
  })

  it('takes the invite code from the link, joins as a kid and asks them to check their inbox', async () => {
    inRouter(<JoinPage />, '/join?code=ABC123')
    expect(screen.getByLabelText('Invite code')).toHaveValue('ABC123')
    expect(screen.getByLabelText('🦸 Parent')).toBeChecked()
    await userEvent.click(screen.getByLabelText('🌟 Kid'))
    await userEvent.type(screen.getByLabelText('Your name'), 'Mia')
    await userEvent.type(screen.getByLabelText('Email'), 'mia@example.com')
    await userEvent.type(screen.getByLabelText('Password (8+ characters)'), 'long-password')
    await userEvent.click(screen.getByRole('button', { name: '🎟️ Join the family' }))
    expect(joinFamily).toHaveBeenCalledWith({
      invite_code: 'ABC123',
      role: 'child',
      full_name: 'Mia',
      email: 'mia@example.com',
      username: undefined,
      password: 'long-password',
    })
    expect(await screen.findByRole('heading', { name: 'Check your inbox' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('mia@example.com')
    expect(screen.queryByRole('form', { name: 'Join a family' })).not.toBeInTheDocument()
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull()
  })

  it('joins as a parent with a typed code, and reports a bad code', async () => {
    vi.mocked(joinFamily).mockRejectedValueOnce(new Error('This invite code is not valid.'))
    inRouter(<JoinPage />, '/join')
    expect(screen.getByLabelText('Invite code')).toHaveValue('')
    await userEvent.type(screen.getByLabelText('Invite code'), 'NOPE')
    await userEvent.type(screen.getByLabelText('Your name'), 'Dad')
    await userEvent.type(screen.getByLabelText('Email'), 'dad@example.com')
    await userEvent.type(screen.getByLabelText('Username (optional)'), 'dad')
    await userEvent.type(screen.getByLabelText('Password (8+ characters)'), 'long-password')
    await userEvent.click(screen.getByRole('button', { name: '🎟️ Join the family' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('This invite code is not valid.')
    expect(screen.getByRole('button', { name: '🎟️ Join the family' })).toBeEnabled()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: '🎟️ Join the family' }))
    expect(joinFamily).toHaveBeenLastCalledWith(expect.objectContaining({ invite_code: 'NOPE', role: 'parent', username: 'dad' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Check your inbox')
    expect(screen.getByRole('status')).toHaveTextContent('dad@example.com')
  })

  it('shows the busy label while joining', async () => {
    vi.mocked(joinFamily).mockReturnValue(new Promise(() => {}))
    inRouter(<JoinPage />, '/join')
    await userEvent.type(screen.getByLabelText('Invite code'), 'NOPE')
    await userEvent.type(screen.getByLabelText('Your name'), 'Dad')
    await userEvent.type(screen.getByLabelText('Email'), 'dad@example.com')
    await userEvent.type(screen.getByLabelText('Password (8+ characters)'), 'long-password')
    await userEvent.click(screen.getByRole('button', { name: '🎟️ Join the family' }))
    expect(screen.getByRole('button', { name: '🚀 Joining…' })).toBeDisabled()
  })

  it('links to starting a family and to signing in', () => {
    inRouter(<JoinPage />, '/join')
    expect(screen.getByRole('link', { name: 'Start a new family' })).toHaveAttribute('href', '/signup')
    expect(screen.getByRole('link', { name: 'Back to sign in' })).toHaveAttribute('href', '/login')
  })
})
