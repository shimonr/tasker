import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { fetchPushConfig, subscribePush, unsubscribePush } from '../api'
import NotificationToggle from './NotificationToggle'

vi.mock('../api', () => ({
  fetchPushConfig: vi.fn(),
  subscribePush: vi.fn(),
  unsubscribePush: vi.fn(),
}))

const KEY = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U'
const ENDPOINT = 'https://push.example/device-1'
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
const IOS_HINT = 'On iPhone, add this app to your Home Screen first (Share → Add to Home Screen), then open it from there to turn on notifications.'

const makeSubscription = () => ({
  endpoint: ENDPOINT,
  toJSON: () => ({ endpoint: ENDPOINT, keys: { p256dh: 'P256DH', auth: 'AUTH' } }),
  unsubscribe: vi.fn().mockResolvedValue(true),
})

const notification = { requestPermission: vi.fn() }
const pushManager = { getSubscription: vi.fn(), subscribe: vi.fn() }
const registration = { pushManager }
const serviceWorker = { getRegistration: vi.fn(), register: vi.fn(), ready: Promise.resolve(registration) }
let onNotify: ReturnType<typeof vi.fn>

/** Let the config request and the first subscription check finish. */
const settle = () => act(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0))
})

const renderToggle = async () => {
  const utils = render(<NotificationToggle onNotify={onNotify} />)
  await settle()
  return utils
}

const turnOn = () => screen.getByRole('button', { name: '🔔 Turn on' })
const turnOff = () => screen.getByRole('button', { name: '🔕 Turn off' })

/** Wait until the click has fully finished, including the busy flag clearing. */
const idle = () => waitFor(() => expect(screen.getByRole('button')).toBeEnabled())

beforeEach(() => {
  onNotify = vi.fn()
  vi.mocked(fetchPushConfig).mockResolvedValue({ public_key: KEY })
  vi.mocked(subscribePush).mockResolvedValue({ message: 'Subscribed' })
  vi.mocked(unsubscribePush).mockResolvedValue({ message: 'Removed' })
  notification.requestPermission.mockResolvedValue('granted')
  pushManager.getSubscription.mockResolvedValue(null)
  pushManager.subscribe.mockResolvedValue(makeSubscription())
  serviceWorker.getRegistration.mockResolvedValue(registration)
  vi.stubGlobal('Notification', notification)
  vi.stubGlobal('PushManager', function PushManager() {})
  Object.defineProperty(navigator, 'serviceWorker', { value: serviceWorker, configurable: true })
})

afterEach(() => {
  vi.unstubAllGlobals()
  Reflect.deleteProperty(navigator, 'serviceWorker')
  Reflect.deleteProperty(navigator, 'userAgent')
})

describe('NotificationToggle: when it is shown', () => {
  it.each(['Notification', 'PushManager', 'serviceWorker'])('stays hidden when %s is unavailable', async (missing) => {
    if (missing === 'serviceWorker') Reflect.deleteProperty(navigator, 'serviceWorker')
    else Reflect.deleteProperty(globalThis, missing)
    const { container } = await renderToggle()
    expect(fetchPushConfig).toHaveBeenCalled()
    expect(container).toBeEmptyDOMElement()
  })

  it('stays hidden when the server has no push key', async () => {
    vi.mocked(fetchPushConfig).mockResolvedValue({ public_key: null })
    const { container } = await renderToggle()
    expect(container).toBeEmptyDOMElement()
  })

  it('stays hidden when the push config cannot be loaded', async () => {
    vi.mocked(fetchPushConfig).mockRejectedValue(new Error('Server down'))
    const { container } = await renderToggle()
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the iPhone hint instead of the button when the app is not on the Home Screen', async () => {
    Object.defineProperty(navigator, 'userAgent', { value: IPHONE_UA, configurable: true })
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }))
    await renderToggle()
    expect(screen.getByText(IOS_HINT)).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('shows the iPhone hint even where the browser has no push APIs', async () => {
    Object.defineProperty(navigator, 'userAgent', { value: IPHONE_UA, configurable: true })
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }))
    Reflect.deleteProperty(globalThis, 'PushManager')
    await renderToggle()
    expect(screen.getByText(IOS_HINT)).toBeInTheDocument()
  })

  it('shows the toggle on iPhone once the app runs from the Home Screen', async () => {
    Object.defineProperty(navigator, 'userAgent', { value: IPHONE_UA, configurable: true })
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }))
    await renderToggle()
    expect(screen.queryByText(IOS_HINT)).not.toBeInTheDocument()
    expect(turnOn()).toBeInTheDocument()
  })
})

describe('NotificationToggle: state', () => {
  it('shows Off with a Turn on button when this device has no subscription', async () => {
    await renderToggle()
    expect(screen.getByText('Off')).toBeInTheDocument()
    expect(turnOn()).toBeInTheDocument()
    expect(serviceWorker.getRegistration).toHaveBeenCalled()
  })

  it('shows On with a Turn off button when this device is already subscribed', async () => {
    pushManager.getSubscription.mockResolvedValue(makeSubscription())
    await renderToggle()
    expect(screen.getByText('On')).toBeInTheDocument()
    expect(turnOff()).toBeInTheDocument()
  })

  it('shows Off when the app has no service worker registration yet', async () => {
    serviceWorker.getRegistration.mockResolvedValue(undefined)
    await renderToggle()
    expect(screen.getByText('Off')).toBeInTheDocument()
  })
})

describe('NotificationToggle: turning on', () => {
  it('asks permission, subscribes with the server key and saves the subscription', async () => {
    await renderToggle()
    fireEvent.click(turnOn())
    await idle()
    expect(turnOff()).toBeInTheDocument()

    expect(notification.requestPermission).toHaveBeenCalled()
    expect(pushManager.subscribe).toHaveBeenCalledWith({ userVisibleOnly: true, applicationServerKey: expect.any(Uint8Array) })
    const { applicationServerKey } = pushManager.subscribe.mock.calls[0][0] as { applicationServerKey: Uint8Array }
    expect(applicationServerKey).toHaveLength(65)
    expect(applicationServerKey[0]).toBe(4)
    expect(subscribePush).toHaveBeenCalledWith({ endpoint: ENDPOINT, keys: { p256dh: 'P256DH', auth: 'AUTH' } })
    expect(onNotify).toHaveBeenCalledWith('Notifications are on! 🔔')
    expect(screen.getByText('On')).toBeInTheDocument()
  })

  it('explains how to unblock notifications when permission is denied', async () => {
    notification.requestPermission.mockResolvedValue('denied')
    await renderToggle()
    fireEvent.click(turnOn())
    await idle()
    expect(onNotify).toHaveBeenCalledWith(expect.stringContaining('Notifications are blocked'), 'error')
    expect(pushManager.subscribe).not.toHaveBeenCalled()
    expect(subscribePush).not.toHaveBeenCalled()
    expect(turnOn()).toBeInTheDocument()
  })

  it('says so and stays off when the browser refuses to subscribe', async () => {
    pushManager.subscribe.mockRejectedValue(new Error('Registration failed - push service error'))
    await renderToggle()
    fireEvent.click(turnOn())
    await idle()
    expect(onNotify).toHaveBeenCalledWith("Couldn't update notifications. Please try again.", 'error')
    expect(subscribePush).not.toHaveBeenCalled()
    expect(turnOn()).toBeInTheDocument()
  })

  it('drops the browser subscription again when the server cannot save it', async () => {
    const subscription = makeSubscription()
    pushManager.subscribe.mockResolvedValue(subscription)
    vi.mocked(subscribePush).mockRejectedValue(new Error('Server down'))
    await renderToggle()
    fireEvent.click(turnOn())
    await idle()
    expect(onNotify).toHaveBeenCalledWith("Couldn't update notifications. Please try again.", 'error')
    expect(subscription.unsubscribe).toHaveBeenCalled()
    expect(turnOn()).toBeInTheDocument()
  })
})

describe('NotificationToggle: turning off', () => {
  it('deletes the subscription on the server and in the browser', async () => {
    const subscription = makeSubscription()
    pushManager.getSubscription.mockResolvedValue(subscription)
    await renderToggle()
    fireEvent.click(turnOff())
    await idle()
    expect(turnOn()).toBeInTheDocument()
    expect(unsubscribePush).toHaveBeenCalledWith(ENDPOINT)
    expect(subscription.unsubscribe).toHaveBeenCalled()
    expect(onNotify).toHaveBeenCalledWith('Notifications are off.')
    expect(screen.getByText('Off')).toBeInTheDocument()
  })

  it('goes back to Off quietly when the browser has already dropped the subscription', async () => {
    pushManager.getSubscription.mockResolvedValueOnce(makeSubscription()).mockResolvedValueOnce(null)
    await renderToggle()
    fireEvent.click(turnOff())
    await idle()
    expect(turnOn()).toBeInTheDocument()
    expect(unsubscribePush).not.toHaveBeenCalled()
    expect(onNotify).toHaveBeenCalledWith('Notifications are off.')
  })

  it('stays on and says so when the server cannot delete the subscription', async () => {
    const subscription = makeSubscription()
    pushManager.getSubscription.mockResolvedValue(subscription)
    vi.mocked(unsubscribePush).mockRejectedValue(new Error('Server down'))
    await renderToggle()
    fireEvent.click(turnOff())
    await idle()
    expect(onNotify).toHaveBeenCalledWith("Couldn't update notifications. Please try again.", 'error')
    expect(subscription.unsubscribe).not.toHaveBeenCalled()
    expect(turnOff()).toBeInTheDocument()
  })
})
