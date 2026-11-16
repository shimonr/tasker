import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RedemptionList from './RedemptionList'
import { redemption } from '../test/fixtures'

describe('RedemptionList', () => {
  it('lets a parent see who asked and hand over requested rewards', async () => {
    const onFulfill = vi.fn()
    render(
      <RedemptionList
        redemptions={[redemption({ id: 4, reward_emoji: null }), redemption({ id: 5, reward_name: 'Stickers', status: 'fulfilled' })]}
        emptyText="none"
        onFulfill={onFulfill}
      />,
    )
    const list = screen.getByRole('list', { name: 'Reward requests' })
    const [requested, fulfilled] = within(list).getAllByRole('listitem')
    expect(requested).toHaveTextContent('Mia · ⭐ 10 · Jan 5, 2026')
    expect(requested).toHaveTextContent('🎁')
    await userEvent.click(within(requested).getByRole('button', { name: '✅ Fulfill' }))
    expect(onFulfill).toHaveBeenCalledWith(4)
    expect(fulfilled).toHaveTextContent('🎉 Handed over')
    expect(within(fulfilled).queryByRole('button')).not.toBeInTheDocument()
  })

  it('shows a child their own progress without names or buttons', () => {
    render(<RedemptionList redemptions={[redemption({ status: 'requested' }), redemption({ id: 2, status: 'fulfilled' })]} emptyText="none" />)
    const list = screen.getByRole('list', { name: 'My rewards' })
    const [waiting, got] = within(list).getAllByRole('listitem')
    expect(waiting).toHaveTextContent('Pizza night')
    expect(waiting).not.toHaveTextContent('Mia ·')
    expect(within(waiting).getByText('⏳ Waiting for a grown-up')).toBeInTheDocument()
    expect(got).toHaveTextContent('🎉 Got it!')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('shows the empty message when there is nothing yet', () => {
    render(<RedemptionList redemptions={[]} emptyText="Nothing yet." />)
    expect(screen.getByText('Nothing yet.')).toBeInTheDocument()
  })
})
