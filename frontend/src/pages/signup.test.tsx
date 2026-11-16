import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { joinFamily, signup } from '../api'
import JoinPage from './JoinPage'
import SignupPage from './SignupPage'

vi.mock('../api', () => ({ signup: vi.fn(), joinFamily: vi.fn() }))

const inRouter = (ui: JSX.Element, path = '/') => render(<MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>)

describe('SignupPage', () => {
  it('creates a family and hands the new token to the app', async () => {
    const onSignedIn = vi.fn().mockResolvedValue(undefined)
    vi.mocked(signup).mockResolvedValue({ access_token: 'tok', token_type: 'bearer' })
    inRouter(<SignupPage onSignedIn={onSignedIn} />)
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
    expect(onSignedIn).toHaveBeenCalledWith('tok')
    expect(screen.getByRole('button', { name: '🚀 Building your family…' })).toBeDisabled()
  })

  it('sends a username when one is given and shows errors so the form can be retried', async () => {
    const onSignedIn = vi.fn().mockRejectedValueOnce(new Error('Could not validate credentials')).mockResolvedValue(undefined)
    vi.mocked(signup).mockResolvedValue({ access_token: 'tok', token_type: 'bearer' })
    inRouter(<SignupPage onSignedIn={onSignedIn} />)
    await userEvent.type(screen.getByLabelText('Family name'), 'The Riveras')
    await userEvent.type(screen.getByLabelText('Your name'), 'Mom')
    await userEvent.type(screen.getByLabelText('Email'), 'mom@example.com')
    await userEvent.type(screen.getByLabelText('Username (optional)'), 'mom')
    await userEvent.type(screen.getByLabelText('Password (8+ characters)'), 'long-password')
    await userEvent.click(screen.getByRole('button', { name: '🏡 Create our family' }))
    expect(signup).toHaveBeenLastCalledWith(expect.objectContaining({ username: 'mom' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not validate credentials')
    expect(screen.getByRole('button', { name: '🏡 Create our family' })).toBeEnabled()
    await userEvent.click(screen.getByRole('button', { name: '🏡 Create our family' }))
    expect(onSignedIn).toHaveBeenCalledTimes(2)
  })

  it('links to joining and to signing in', () => {
    inRouter(<SignupPage onSignedIn={vi.fn()} />)
    expect(screen.getByRole('link', { name: 'Join it' })).toHaveAttribute('href', '/join')
    expect(screen.getByRole('link', { name: 'Back to sign in' })).toHaveAttribute('href', '/login')
  })
})

describe('JoinPage', () => {
  it('takes the invite code from the link and joins as a kid', async () => {
    const onSignedIn = vi.fn().mockResolvedValue(undefined)
    vi.mocked(joinFamily).mockResolvedValue({ access_token: 'kid-tok', token_type: 'bearer' })
    inRouter(<JoinPage onSignedIn={onSignedIn} />, '/join?code=ABC123')
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
    expect(onSignedIn).toHaveBeenCalledWith('kid-tok')
  })

  it('joins as a parent with a typed code, and reports a bad code', async () => {
    const onSignedIn = vi.fn()
    vi.mocked(joinFamily).mockRejectedValueOnce(new Error('This invite code is not valid.')).mockResolvedValue({ access_token: 'p', token_type: 'bearer' })
    inRouter(<JoinPage onSignedIn={onSignedIn} />, '/join')
    expect(screen.getByLabelText('Invite code')).toHaveValue('')
    await userEvent.type(screen.getByLabelText('Invite code'), 'NOPE')
    await userEvent.type(screen.getByLabelText('Your name'), 'Dad')
    await userEvent.type(screen.getByLabelText('Email'), 'dad@example.com')
    await userEvent.type(screen.getByLabelText('Username (optional)'), 'dad')
    await userEvent.type(screen.getByLabelText('Password (8+ characters)'), 'long-password')
    await userEvent.click(screen.getByRole('button', { name: '🎟️ Join the family' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('This invite code is not valid.')
    expect(screen.getByRole('button', { name: '🎟️ Join the family' })).toBeEnabled()
    expect(onSignedIn).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: '🎟️ Join the family' }))
    expect(joinFamily).toHaveBeenLastCalledWith(expect.objectContaining({ invite_code: 'NOPE', role: 'parent', username: 'dad' }))
    expect(onSignedIn).toHaveBeenCalledWith('p')
  })

  it('links to starting a family and to signing in', () => {
    inRouter(<JoinPage onSignedIn={vi.fn()} />, '/join')
    expect(screen.getByRole('link', { name: 'Start a new family' })).toHaveAttribute('href', '/signup')
    expect(screen.getByRole('link', { name: 'Back to sign in' })).toHaveAttribute('href', '/login')
  })
})
