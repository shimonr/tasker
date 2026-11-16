import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import BadgeGrid from './BadgeGrid'
import RewardShop from './RewardShop'
import { reward } from '../test/fixtures'

describe('RewardShop', () => {
  it('lets a kid redeem what they can afford and explains the rest', async () => {
    const onRedeem = vi.fn()
    const pizza = reward({ id: 1, name: 'Pizza night', cost: 10 })
    const sticker = reward({ id: 2, name: 'Sticker', emoji: null, cost: 11 })
    render(<RewardShop rewards={[pizza, sticker]} balance={10} onRedeem={onRedeem} />)
    await userEvent.click(screen.getByRole('button', { name: 'Redeem Pizza night' }))
    expect(onRedeem).toHaveBeenCalledWith(pizza)
    expect(screen.getByRole('button', { name: 'Redeem Sticker' })).toBeDisabled()
    expect(screen.getByText('Save up 1 more star for this one!')).toBeInTheDocument()
    expect(screen.getByText('🎁', { selector: 'span' })).toBeInTheDocument()
  })

  it('says when the shop is empty', () => {
    render(<RewardShop rewards={[]} balance={0} onRedeem={vi.fn()} />)
    expect(screen.getByText(/The shop is empty/)).toBeInTheDocument()
  })
})

describe('BadgeGrid', () => {
  it('shows earned badges in colour and locked ones greyed out', () => {
    render(
      <BadgeGrid
        badges={[
          { key: 'first_task', title: 'First mission', emoji: '🎯', earned: true },
          { key: 'stars_10', title: 'Star collector', emoji: '⭐', earned: false },
        ]}
      />,
    )
    expect(screen.getByRole('list', { name: 'Badges' })).toBeInTheDocument()
    expect(screen.getByText('First mission').closest('li')).not.toHaveClass('grayscale')
    expect(screen.getByText('✅ Earned!')).toBeInTheDocument()
    expect(screen.getByText('Star collector').closest('li')).toHaveClass('grayscale')
    expect(screen.getByText('🔒 Locked')).toBeInTheDocument()
  })
})
