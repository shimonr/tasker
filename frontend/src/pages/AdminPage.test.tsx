import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { changePassword, createUser, deleteUser, fetchAdminFamilies, fetchUsers, resetPassword, updateUser } from '../api'
import AdminPage from './AdminPage'
import { admin, leo, mia } from '../test/fixtures'

vi.mock('../api', () => ({
  changePassword: vi.fn(),
  createUser: vi.fn(),
  deleteUser: vi.fn(),
  fetchAdminFamilies: vi.fn(),
  fetchUsers: vi.fn(),
  resetPassword: vi.fn(),
  updateUser: vi.fn(),
}))

const onNewToken = vi.fn()

const renderPage = async () => {
  render(<AdminPage user={admin} onLogout={vi.fn()} onNewToken={onNewToken} />)
  await screen.findByText('mia@example.com')
}

const row = (email: string) => screen.getByText(email).closest('li') as HTMLElement

describe('AdminPage', () => {
  beforeEach(() => {
    vi.mocked(fetchUsers).mockResolvedValue([admin, { ...mia, family_name: 'The Riveras' }, { ...leo, family_name: 'The Riveras' }])
    vi.mocked(fetchAdminFamilies).mockResolvedValue([
      { id: 1, name: 'The Riveras', member_count: 3 },
      { id: 2, name: 'The Smiths', member_count: 1 },
    ])
    for (const fn of [createUser, deleteUser, resetPassword, updateUser]) vi.mocked(fn).mockResolvedValue({} as never)
  })

  it('lists everyone with their family, without exposing passwords', async () => {
    await renderPage()
    expect(screen.getByRole('heading', { name: /Everyone \(3\)/ })).toBeInTheDocument()
    expect(within(row('leo@example.com')).getByText('🌟 Kid')).toBeInTheDocument()
    expect(within(row('leo@example.com')).getByText('🏠 The Riveras')).toBeInTheDocument()
    expect(within(row('mia@example.com')).getByText('@mia')).toBeInTheDocument()
    expect(within(row('admin@example.com')).queryByText(/🏠/)).not.toBeInTheDocument()
    expect(screen.queryByText(/password/i, { selector: 'li *' })).not.toBeInTheDocument()
    expect(within(row('admin@example.com')).getByRole('button', { name: 'Remove Administrator' })).toBeDisabled()
  })

  it('lists families with their member counts', async () => {
    await renderPage()
    expect(screen.getByRole('heading', { name: /Families \(2\)/ })).toBeInTheDocument()
    const families = screen.getByRole('list', { name: 'Families' })
    expect(within(families).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['The Riveras3 members', 'The Smiths1 member'])
  })

  it('creates an account', async () => {
    await renderPage()
    const form = screen.getByRole('form', { name: 'Create account' })
    expect(within(form).queryByLabelText('Family')).not.toBeInTheDocument()
    await userEvent.type(within(form).getByLabelText('Username'), 'zoe')
    await userEvent.type(within(form).getByLabelText('Email'), 'zoe@example.com')
    await userEvent.type(within(form).getByLabelText('Full name'), 'Zoe')
    await userEvent.type(within(form).getByLabelText('Password'), 'long-password')
    await userEvent.click(within(form).getByLabelText('🌟 Kid'))
    await userEvent.selectOptions(within(form).getByLabelText('Family'), 'The Smiths')
    await userEvent.click(within(form).getByRole('button', { name: '✨ Create account' }))
    expect(createUser).toHaveBeenCalledWith({ username: 'zoe', email: 'zoe@example.com', full_name: 'Zoe', role: 'child', password: 'long-password', family_id: 2 })
    expect(await screen.findByRole('status')).toHaveTextContent('Account created!')
    expect(within(form).getByLabelText('Email')).toHaveValue('')
    expect(within(form).queryByLabelText('Family')).not.toBeInTheDocument()
  })

  it('does not send a family for parents', async () => {
    await renderPage()
    const form = screen.getByRole('form', { name: 'Create account' })
    await userEvent.type(within(form).getByLabelText('Email'), 'pat@example.com')
    await userEvent.type(within(form).getByLabelText('Password'), 'long-password')
    await userEvent.click(within(form).getByRole('button', { name: '✨ Create account' }))
    expect(createUser).toHaveBeenCalledWith({ username: '', email: 'pat@example.com', full_name: '', role: 'parent', password: 'long-password' })
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

  it('changes my own password and keeps this browser signed in with the fresh token', async () => {
    vi.mocked(changePassword).mockResolvedValue({ access_token: 'fresh', token_type: 'bearer' })
    await renderPage()
    const form = screen.getByRole('form', { name: 'Change my password' })
    await userEvent.type(within(form).getByLabelText('Current password'), 'old-password')
    await userEvent.type(within(form).getByLabelText('New password'), 'brand-new-pass')
    await userEvent.type(within(form).getByLabelText('Repeat new password'), 'brand-new-pass')
    await userEvent.click(within(form).getByRole('button', { name: '💾 Change password' }))
    expect(changePassword).toHaveBeenCalledWith('old-password', 'brand-new-pass')
    expect(onNewToken).toHaveBeenCalledWith('fresh')
    expect(await screen.findByRole('status')).toHaveTextContent('Password changed! Your other devices were signed out.')
    expect(within(form).getByLabelText('Current password')).toHaveValue('')
    expect(within(form).getByLabelText('New password')).toHaveValue('')
    expect(within(form).getByLabelText('Repeat new password')).toHaveValue('')
  })

  it('checks my new password before asking the server', async () => {
    await renderPage()
    const form = screen.getByRole('form', { name: 'Change my password' })
    await userEvent.type(within(form).getByLabelText('Current password'), 'old-password')
    await userEvent.type(within(form).getByLabelText('New password'), 'brand-new-pass')
    await userEvent.type(within(form).getByLabelText('Repeat new password'), 'brand-new-passs')
    await userEvent.click(within(form).getByRole('button', { name: '💾 Change password' }))
    expect(await screen.findByRole('alert')).toHaveTextContent("The new passwords don't match.")

    await userEvent.clear(within(form).getByLabelText('New password'))
    await userEvent.type(within(form).getByLabelText('New password'), 'short')
    await userEvent.clear(within(form).getByLabelText('Repeat new password'))
    await userEvent.type(within(form).getByLabelText('Repeat new password'), 'short')
    await userEvent.click(within(form).getByRole('button', { name: '💾 Change password' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Your new password needs 8+ characters.')
    expect(changePassword).not.toHaveBeenCalled()
    expect(onNewToken).not.toHaveBeenCalled()
  })

  it('shows why the password could not be changed and keeps the typed values', async () => {
    vi.mocked(changePassword).mockRejectedValue(new Error('Your current password is not right.'))
    await renderPage()
    const form = screen.getByRole('form', { name: 'Change my password' })
    await userEvent.type(within(form).getByLabelText('Current password'), 'wrong-password')
    await userEvent.type(within(form).getByLabelText('New password'), 'brand-new-pass')
    await userEvent.type(within(form).getByLabelText('Repeat new password'), 'brand-new-pass')
    await userEvent.click(within(form).getByRole('button', { name: '💾 Change password' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Your current password is not right.')
    expect(onNewToken).not.toHaveBeenCalled()
    expect(within(form).getByLabelText('New password')).toHaveValue('brand-new-pass')
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
