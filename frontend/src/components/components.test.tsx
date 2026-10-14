import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import Confetti from './Confetti'
import Modal from './Modal'
import Navbar from './Navbar'
import TaskSections from './TaskSections'
import { useToast } from './Toast'
import AuthLayout from './AuthLayout'
import { mia, task } from '../test/fixtures'

function ToastHarness({ action, success }: { action: () => Promise<unknown>; success?: string }) {
  const { toast, attempt, notify } = useToast()
  return (
    <>
      {toast}
      <button onClick={() => attempt(action, success)}>run</button>
      <button onClick={() => notify('Again')}>again</button>
    </>
  )
}

describe('useToast', () => {
  afterEach(() => vi.useRealTimers())

  it('reports success, hides after a while and replaces earlier toasts', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    render(<ToastHarness action={() => Promise.resolve()} success="Saved" />)
    await userEvent.click(screen.getByText('run'))
    expect(screen.getByRole('status')).toHaveTextContent('🎉 Saved')
    await userEvent.click(screen.getByText('again'))
    expect(screen.getByRole('status')).toHaveTextContent('Again')
    act(() => vi.advanceTimersByTime(3600))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('stays quiet on success without a message and shows errors', async () => {
    const { unmount } = render(<ToastHarness action={() => Promise.resolve()} />)
    await userEvent.click(screen.getByText('run'))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    unmount()
    render(<ToastHarness action={() => Promise.reject(new Error('Boom'))} />)
    await userEvent.click(screen.getByText('run'))
    expect(screen.getByRole('alert')).toHaveTextContent('🙈 Boom')
  })
})

describe('Modal', () => {
  it('closes with the button, the backdrop and Escape but not inner clicks', async () => {
    const onClose = vi.fn()
    render(
      <Modal title="Hello" subtitle="Sub" onClose={onClose}>
        <p>Body</p>
      </Modal>,
    )
    const dialog = screen.getByRole('dialog', { name: 'Hello' })
    expect(screen.getByText('Sub')).toBeInTheDocument()
    await userEvent.click(screen.getByText('Body'))
    expect(onClose).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    await userEvent.click(dialog.parentElement!)
    await userEvent.keyboard('{Escape}')
    await userEvent.keyboard('a')
    expect(onClose).toHaveBeenCalledTimes(3)
  })

  it('works without a subtitle', () => {
    render(
      <Modal title="Plain" onClose={vi.fn()}>
        x
      </Modal>,
    )
    expect(screen.getByRole('dialog', { name: 'Plain' })).toBeInTheDocument()
  })
})

describe('small components', () => {
  it('Navbar shows the user and logs out', async () => {
    const onLogout = vi.fn()
    render(<Navbar user={mia} onLogout={onLogout} />)
    expect(screen.getByText(/Explorer/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Log out' }))
    expect(onLogout).toHaveBeenCalled()
  })

  it('Confetti renders decorative pieces', () => {
    render(<Confetti />)
    expect(screen.getByTestId('confetti').children).toHaveLength(36)
  })

  it('TaskSections shows sections or the empty message', () => {
    const { rerender } = render(<TaskSections tasks={[task()]} empty="Nothing" renderTask={(t) => <p key={t.id}>{t.title}</p>} />)
    expect(screen.getByRole('heading', { name: /One-time missions/ })).toBeInTheDocument()
    expect(screen.getByText('Tidy room')).toBeInTheDocument()
    rerender(<TaskSections tasks={[]} empty="Nothing" renderTask={() => null} />)
    expect(screen.getByText('Nothing')).toBeInTheDocument()
  })

  it('AuthLayout frames its content', () => {
    render(
      <MemoryRouter>
        <AuthLayout title="T" subtitle="S">
          <p>child</p>
        </AuthLayout>
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: 'T' })).toBeInTheDocument()
    expect(screen.getByText('child')).toBeInTheDocument()
  })
})
