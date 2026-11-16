import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import FamilyPanel, { inviteLink } from './FamilyPanel'
import type { FamilyView } from '../types'
import { leo, mia, parent } from '../test/fixtures'

const family: FamilyView = { id: 1, name: 'The Riveras', invite_code: 'Ab 1/2', members: [parent, { ...mia, color: '#123456' }, leo] }

describe('FamilyPanel', () => {
  it('builds a join link from the invite code', () => {
    expect(inviteLink('Ab 1/2')).toBe(`${window.location.origin}/join?code=Ab%201%2F2`)
  })

  it('shows the family, its link and everyone in it', () => {
    render(<FamilyPanel family={family} onNewCode={vi.fn()} onNotify={vi.fn()} />)
    expect(screen.getByRole('heading', { name: '🏠 The Riveras' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Family members (3)' })).toBeInTheDocument()
    const members = within(screen.getByRole('list', { name: 'Family members' })).getAllByRole('listitem')
    expect(members[1]).toHaveTextContent('Mia')
    expect(members[1].querySelector('span[aria-hidden]')).toHaveStyle({ backgroundColor: 'rgb(18, 52, 86)' })
    expect(members[2].querySelector('span[aria-hidden]')).not.toHaveStyle({ backgroundColor: 'rgb(18, 52, 86)' })
  })

  it('copies the link and says so, or explains when the browser refuses', async () => {
    const onNotify = vi.fn()
    const writeText = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('no'))
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(<FamilyPanel family={family} onNewCode={vi.fn()} onNotify={onNotify} />)
    await userEvent.click(screen.getByRole('button', { name: '📋 Copy link' }))
    expect(writeText).toHaveBeenCalledWith(inviteLink('Ab 1/2'))
    expect(onNotify).toHaveBeenLastCalledWith('Invite link copied! 📋')
    await userEvent.click(screen.getByRole('button', { name: '📋 Copy link' }))
    expect(onNotify).toHaveBeenLastCalledWith("Couldn't copy it. Select the link and copy it yourself.", 'error')
  })

  it('asks for a new invite code', async () => {
    const onNewCode = vi.fn()
    render(<FamilyPanel family={family} onNewCode={onNewCode} onNotify={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: '🎟️ New invite code' }))
    expect(onNewCode).toHaveBeenCalled()
  })
})
