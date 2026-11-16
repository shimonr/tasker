import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AddKidForm from './AddKidForm'

describe('AddKidForm', () => {
  it('sends the new kid with an avatar and colour, leaving out a blank username', async () => {
    const onSubmit = vi.fn().mockResolvedValue(true)
    render(<AddKidForm onSubmit={onSubmit} onCancel={vi.fn()} />)
    await userEvent.type(screen.getByLabelText('Full name'), 'Leo Lion')
    await userEvent.type(screen.getByLabelText('Email'), 'leo@example.com')
    await userEvent.type(screen.getByLabelText('Password (8+ characters)'), 'long-password')
    await userEvent.click(screen.getByLabelText('🦁'))
    await userEvent.click(screen.getByRole('button', { name: '✨ Add kid' }))
    expect(onSubmit).toHaveBeenCalledWith({
      full_name: 'Leo Lion',
      email: 'leo@example.com',
      username: undefined,
      password: 'long-password',
      avatar: '🦁',
      color: '#ff4fa0',
    })
  })

  it('sends a username and the chosen colour when given', async () => {
    const onSubmit = vi.fn().mockResolvedValue(true)
    render(<AddKidForm onSubmit={onSubmit} onCancel={vi.fn()} />)
    await userEvent.type(screen.getByLabelText('Full name'), 'Mia')
    await userEvent.type(screen.getByLabelText('Email'), 'mia@example.com')
    await userEvent.type(screen.getByLabelText('Username (optional)'), 'mia')
    await userEvent.type(screen.getByLabelText('Password (8+ characters)'), 'long-password')
    await userEvent.click(screen.getByLabelText('🦄'))
    await userEvent.click(screen.getByRole('button', { name: '✨ Add kid' }))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ username: 'mia', avatar: '🦄' }))
  })

  it('cannot be sent twice while it is being saved', async () => {
    let finish: (value: unknown) => void = () => {}
    const onSubmit = vi.fn(() => new Promise((resolve) => (finish = resolve)))
    render(<AddKidForm onSubmit={onSubmit} onCancel={vi.fn()} />)
    await userEvent.type(screen.getByLabelText('Full name'), 'Mia')
    await userEvent.type(screen.getByLabelText('Email'), 'mia@example.com')
    await userEvent.type(screen.getByLabelText('Password (8+ characters)'), 'long-password')
    await userEvent.click(screen.getByRole('button', { name: '✨ Add kid' }))
    expect(screen.getByRole('button', { name: '✨ Add kid' })).toBeDisabled()
    finish(true)
  })

  it('can be cancelled', async () => {
    const onCancel = vi.fn()
    render(<AddKidForm onSubmit={vi.fn()} onCancel={onCancel} />)
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalled()
  })
})
