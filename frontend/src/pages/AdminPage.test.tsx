import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createUser, deleteUser, fetchUsers, resetPassword, updateUser } from '../api'
import AdminPage from './AdminPage'
import { admin, leo, mia } from '../test/fixtures'

vi.mock('../api', () => ({
  createUser: vi.fn(),
  deleteUser: vi.fn(),
  fetchUsers: vi.fn(),
  resetPassword: vi.fn(),
  updateUser: vi.fn(),
}))

const renderPage = async () => {
  render(<AdminPage user={admin} onLogout={vi.fn()} />)
  await screen.findByText('mia@example.com')
}

const row = (email: string) => screen.getByText(email).closest('li') as HTMLElement

describe('AdminPage', () => {
  beforeEach(() => {
    vi.mocked(fetchUsers).mockResolvedValue([admin, mia, leo])
    for (const fn of [createUser, deleteUser, resetPassword, updateUser]) vi.mocked(fn).mockResolvedValue({} as never)
  })

  it('lists everyone without exposing passwords', async () => {
    await renderPage()
    expect(screen.getByRole('heading', { name: /Everyone \(3\)/ })).toBeInTheDocument()
    expect(within(row('leo@example.com')).getByText('🌟 Kid')).toBeInTheDocument()
    expect(within(row('mia@example.com')).getByText('@mia')).toBeInTheDocument()
    expect(screen.queryByText(/password/i, { selector: 'li *' })).not.toBeInTheDocument()
    expect(within(row('admin@example.com')).getByRole('button', { name: 'Remove Administrator' })).toBeDisabled()
  })

  it('creates an account', async () => {
    await renderPage()
    const form = screen.getByRole('form', { name: 'Create account' })
    await userEvent.type(within(form).getByLabelText('Username'), 'zoe')
    await userEvent.type(within(form).getByLabelText('Email'), 'zoe@example.com')
    await userEvent.type(within(form).getByLabelText('Full name'), 'Zoe')
    await userEvent.type(within(form).getByLabelText('Password'), 'long-password')
    await userEvent.click(within(form).getByLabelText('🌟 Kid'))
    await userEvent.click(within(form).getByRole('button', { name: '✨ Create account' }))
    expect(createUser).toHaveBeenCalledWith({ username: 'zoe', email: 'zoe@example.com', full_name: 'Zoe', role: 'child', password: 'long-password' })
    expect(await screen.findByRole('status')).toHaveTextContent('Account created!')
    expect(within(form).getByLabelText('Email')).toHaveValue('')
  })

  it('shows API errors', async () => {
    vi.mocked(createUser).mockRejectedValue(new Error('Email address or username has already been used.'))
    await renderPage()
    const form = screen.getByRole('form', { name: 'Create account' })
    await userEvent.type(within(form).getByLabelText('Email'), 'mia@example.com')
    await userEvent.type(within(form).getByLabelText('Password'), 'long-password')
    await userEvent.click(within(form).getByRole('button', { name: '✨ Create account' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('already been used')
  })

  it('resets a password', async () => {
    await renderPage()
    const form = screen.getByRole('form', { name: 'Reset password' })
    await userEvent.selectOptions(within(form).getByLabelText('Account'), 'leo@example.com')
    await userEvent.type(within(form).getByLabelText('New password'), 'brand-new-pass')
    await userEvent.click(within(form).getByRole('button', { name: '🔐 Set new password' }))
    expect(resetPassword).toHaveBeenCalledWith('leo@example.com', 'brand-new-pass')
    expect(await screen.findByRole('status')).toHaveTextContent('Password updated')
    expect(within(form).getByLabelText('New password')).toHaveValue('')
  })

  it('edits a user inline', async () => {
    await renderPage()
    await userEvent.click(screen.getByRole('button', { name: 'Edit leo' }))
    const editing = screen.getByDisplayValue('leo@example.com').closest('li') as HTMLElement
    expect(within(editing).getByLabelText('Full name')).toHaveValue('')
    await userEvent.type(within(editing).getByLabelText('Full name'), 'Leo Lion')
    await userEvent.clear(within(editing).getByLabelText('Username'))
    await userEvent.type(within(editing).getByLabelText('Username'), 'leo2')
    await userEvent.clear(within(editing).getByLabelText('Email'))
    await userEvent.type(within(editing).getByLabelText('Email'), 'leo2@example.com')
    await userEvent.selectOptions(within(editing).getByLabelText('Role'), 'parent')
    await userEvent.click(within(editing).getByRole('button', { name: '💾 Save' }))
    expect(updateUser).toHaveBeenCalledWith(leo.id, { username: 'leo2', email: 'leo2@example.com', full_name: 'Leo Lion', role: 'parent' })
    expect(await screen.findByText(/Saved!/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Edit Administrator' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('button', { name: '💾 Save' })).not.toBeInTheDocument()
  })

  it('edits a user without username', async () => {
    vi.mocked(fetchUsers).mockResolvedValue([admin, { ...mia, username: null }])
    await renderPage()
    await userEvent.click(screen.getByRole('button', { name: 'Edit Mia' }))
    expect(within(screen.getByDisplayValue('mia@example.com').closest('li') as HTMLElement).getByLabelText('Username')).toHaveValue('')
  })

  it('confirms before removing someone', async () => {
    await renderPage()
    await userEvent.click(screen.getByRole('button', { name: 'Remove Mia' }))
    await userEvent.click(screen.getByRole('button', { name: 'Keep' }))
    expect(deleteUser).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Remove Mia' }))
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Remove Mia?' })).getByRole('button', { name: '🗑️ Remove' }))
    expect(deleteUser).toHaveBeenCalledWith(mia.id)
    expect(await screen.findByText(/Account removed/)).toBeInTheDocument()
  })
})
