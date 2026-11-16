import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ProfileEditor from './ProfileEditor'
import { mia } from '../test/fixtures'

describe('ProfileEditor', () => {
  it('starts from the current name, avatar and colour', async () => {
    const onSave = vi.fn()
    render(<ProfileEditor user={{ ...mia, avatar: '🐨', color: '#00ff00' }} onSave={onSave} />)
    expect(screen.getByLabelText('My name')).toHaveValue('Mia')
    expect(screen.getByLabelText('🐨')).toBeChecked()
    expect(screen.getByLabelText('My favourite colour')).toHaveValue('#00ff00')
    await userEvent.click(screen.getByRole('button', { name: '💾 Save my look' }))
    expect(onSave).toHaveBeenCalledWith({ full_name: 'Mia', avatar: '🐨', color: '#00ff00' })
  })

  it('starts blank for a kid with no name and falls back to the default look', async () => {
    const onSave = vi.fn()
    render(<ProfileEditor user={{ ...mia, full_name: null }} onSave={onSave} />)
    expect(screen.getByLabelText('My name')).toHaveValue('')
    expect(screen.getByLabelText('🐸')).toBeChecked()
    await userEvent.type(screen.getByLabelText('My name'), 'Mimi')
    await userEvent.click(screen.getByRole('button', { name: '💾 Save my look' }))
    expect(onSave).toHaveBeenCalledWith({ full_name: 'Mimi', avatar: '🐸', color: '#ff4fa0' })
  })
})
