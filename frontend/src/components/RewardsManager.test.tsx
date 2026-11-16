import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createReward, deleteReward, updateReward } from '../api'
import RewardsManager from './RewardsManager'
import { reward } from '../test/fixtures'

vi.mock('../api', () => ({ createReward: vi.fn(), updateReward: vi.fn(), deleteReward: vi.fn() }))

/** Runs the action like the page's attempt(): true on success, false on failure. */
const run = vi.fn(async (action: () => Promise<unknown>) => {
  try {
    await action()
    return true
  } catch {
    return false
  }
})

const rewards = [reward(), reward({ id: 2, name: 'Stickers', emoji: null, cost: 3, active: false })]

describe('RewardsManager', () => {
  beforeEach(() => {
    vi.mocked(createReward).mockResolvedValue(reward())
    vi.mocked(updateReward).mockResolvedValue(reward())
    vi.mocked(deleteReward).mockResolvedValue({})
  })

  it('lists rewards, marks paused ones and shows a gift for rewards without an emoji', () => {
    render(<RewardsManager rewards={rewards} run={run} />)
    const list = screen.getByRole('list', { name: 'Rewards' })
    const [pizza, stickers] = within(list).getAllByRole('listitem')
    expect(pizza).toHaveTextContent('⭐ 10 stars')
    expect(pizza).not.toHaveTextContent('Paused')
    expect(stickers).toHaveTextContent('🎁')
    expect(stickers).toHaveTextContent('⭐ 3 stars · Paused')
  })

  it('says so when there are no rewards yet', () => {
    render(<RewardsManager rewards={[]} run={run} />)
    expect(screen.getByText(/No rewards yet/)).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Rewards' })).not.toBeInTheDocument()
  })

  it('adds a reward with its emoji and cost, then clears the form', async () => {
    render(<RewardsManager rewards={[]} run={run} />)
    const form = screen.getByRole('form', { name: 'New reward' })
    expect(within(form).getByLabelText('Cost in stars')).toHaveValue(10)
    await userEvent.type(within(form).getByLabelText('Reward name'), 'Movie night')
    await userEvent.type(within(form).getByLabelText('Emoji'), '🎬')
    await userEvent.clear(within(form).getByLabelText('Cost in stars'))
    await userEvent.type(within(form).getByLabelText('Cost in stars'), '15')
    await userEvent.click(within(form).getByRole('button', { name: '🎁 Add reward' }))
    expect(createReward).toHaveBeenCalledWith({ name: 'Movie night', emoji: '🎬', cost: 15 })
    expect(run).toHaveBeenCalledWith(expect.any(Function), 'Reward added! 🎁')
    expect(within(form).getByLabelText('Reward name')).toHaveValue('')
    expect(within(form).getByLabelText('Cost in stars')).toHaveValue(10)
  })

  it('keeps what was typed when adding a reward fails', async () => {
    vi.mocked(createReward).mockRejectedValue(new Error('Name is too long'))
    render(<RewardsManager rewards={[]} run={run} />)
    const form = screen.getByRole('form', { name: 'New reward' })
    await userEvent.type(within(form).getByLabelText('Reward name'), 'Trip')
    await userEvent.click(within(form).getByRole('button', { name: '🎁 Add reward' }))
    expect(createReward).toHaveBeenCalledWith({ name: 'Trip', emoji: undefined, cost: 10 })
    expect(within(form).getByLabelText('Reward name')).toHaveValue('Trip')
  })

  it('edits a reward inline and saves the changes', async () => {
    render(<RewardsManager rewards={rewards} run={run} />)
    await userEvent.click(screen.getByRole('button', { name: 'Edit Pizza night' }))
    const form = screen.getByRole('form', { name: 'Edit Pizza night' })
    expect(within(form).getByLabelText('Edit name')).toHaveValue('Pizza night')
    expect(within(form).getByLabelText('Edit emoji')).toHaveValue('🍕')
    await userEvent.type(within(form).getByLabelText('Edit name'), ' party')
    await userEvent.clear(within(form).getByLabelText('Edit emoji'))
    await userEvent.type(within(form).getByLabelText('Edit emoji'), '🥳')
    await userEvent.clear(within(form).getByLabelText('Edit cost'))
    await userEvent.type(within(form).getByLabelText('Edit cost'), '12')
    await userEvent.click(within(form).getByRole('button', { name: '💾 Save' }))
    expect(updateReward).toHaveBeenCalledWith(1, { name: 'Pizza night party', emoji: '🥳', cost: 12 })
    expect(run).toHaveBeenCalledWith(expect.any(Function), 'Reward saved!')
    expect(screen.queryByRole('form', { name: 'Edit Pizza night' })).not.toBeInTheDocument()
  })

  it('edits a reward that has no emoji yet, and can cancel without saving', async () => {
    render(<RewardsManager rewards={rewards} run={run} />)
    await userEvent.click(screen.getByRole('button', { name: 'Edit Stickers' }))
    expect(screen.getByLabelText('Edit emoji')).toHaveValue('')
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(updateReward).not.toHaveBeenCalled()
    expect(screen.getByRole('list', { name: 'Rewards' })).toHaveTextContent('Stickers')
  })

  it('pauses and reactivates a reward', async () => {
    render(<RewardsManager rewards={rewards} run={run} />)
    await userEvent.click(screen.getByRole('button', { name: '⏸️ Pause' }))
    expect(updateReward).toHaveBeenLastCalledWith(1, { active: false })
    expect(run).toHaveBeenLastCalledWith(expect.any(Function), 'Paused. Kids can’t see it for now.')
    await userEvent.click(screen.getByRole('button', { name: '▶️ Activate' }))
    expect(updateReward).toHaveBeenLastCalledWith(2, { active: true })
    expect(run).toHaveBeenLastCalledWith(expect.any(Function), 'Back on the shop! 🛍️')
  })

  it('asks before removing a reward', async () => {
    render(<RewardsManager rewards={rewards} run={run} />)
    await userEvent.click(screen.getByRole('button', { name: 'Delete Pizza night' }))
    await userEvent.click(screen.getByRole('button', { name: 'Keep it' }))
    expect(deleteReward).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Delete Pizza night' }))
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Delete Pizza night' }))
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Remove “Pizza night”?' })).getByRole('button', { name: '🗑️ Remove' }))
    expect(deleteReward).toHaveBeenCalledWith(1)
    expect(run).toHaveBeenLastCalledWith(expect.any(Function), 'Reward removed')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
