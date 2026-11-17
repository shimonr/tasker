import { currentSubscription, isIosWithoutHomeScreen, pushSupported, registerServiceWorker, urlBase64ToUint8Array } from './push'

const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'

const setServiceWorker = (value: unknown) => Object.defineProperty(navigator, 'serviceWorker', { value, configurable: true })

afterEach(() => {
  vi.unstubAllGlobals()
  Reflect.deleteProperty(navigator, 'serviceWorker')
  Reflect.deleteProperty(navigator, 'userAgent')
})

describe('pushSupported', () => {
  it('needs the Notification, Service Worker and Push APIs together', () => {
    expect(pushSupported()).toBe(false)
    vi.stubGlobal('Notification', {})
    vi.stubGlobal('PushManager', function PushManager() {})
    expect(pushSupported()).toBe(false)
    setServiceWorker({})
    expect(pushSupported()).toBe(true)
    Reflect.deleteProperty(globalThis, 'PushManager')
    expect(pushSupported()).toBe(false)
  })
})

describe('isIosWithoutHomeScreen', () => {
  const standalone = (matches: boolean) => vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches }))

  it('is false away from iOS, without looking at the display mode', () => {
    expect(isIosWithoutHomeScreen()).toBe(false)
  })

  it('is true on iPhone and iPad running in the browser tab', () => {
    Object.defineProperty(navigator, 'userAgent', { value: IPHONE_UA, configurable: true })
    standalone(false)
    expect(isIosWithoutHomeScreen()).toBe(true)
    expect(window.matchMedia).toHaveBeenCalledWith('(display-mode: standalone)')
    Object.defineProperty(navigator, 'userAgent', { value: IPHONE_UA.replace('iPhone', 'iPad'), configurable: true })
    expect(isIosWithoutHomeScreen()).toBe(true)
  })

  it('is false on iOS once the app runs from the Home Screen', () => {
    Object.defineProperty(navigator, 'userAgent', { value: IPHONE_UA, configurable: true })
    standalone(true)
    expect(isIosWithoutHomeScreen()).toBe(false)
  })
})

describe('urlBase64ToUint8Array', () => {
  it('turns a VAPID public key into the raw 65-byte point', () => {
    // The example key from the web-push docs: an uncompressed P-256 point starts with byte 0x04.
    const key = urlBase64ToUint8Array('BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U')
    expect(key).toBeInstanceOf(Uint8Array)
    expect(key).toHaveLength(65)
    expect(key[0]).toBe(4)
  })

  it('reads URL-safe characters and restores missing padding', () => {
    expect(Array.from(urlBase64ToUint8Array('AQID'))).toEqual([1, 2, 3])
    expect(Array.from(urlBase64ToUint8Array('AQI'))).toEqual([1, 2])
    expect(Array.from(urlBase64ToUint8Array('AQ'))).toEqual([1])
    expect(Array.from(urlBase64ToUint8Array('-_8'))).toEqual([251, 255])
  })
})

describe('currentSubscription', () => {
  it('is null when the app has no service worker registration', async () => {
    const getRegistration = vi.fn().mockResolvedValue(undefined)
    setServiceWorker({ getRegistration })
    await expect(currentSubscription()).resolves.toBeNull()
  })

  it("returns the browser's push subscription", async () => {
    const subscription = { endpoint: 'https://push.example/1' }
    const getSubscription = vi.fn().mockResolvedValue(subscription)
    setServiceWorker({ getRegistration: vi.fn().mockResolvedValue({ pushManager: { getSubscription } }) })
    await expect(currentSubscription()).resolves.toBe(subscription)
  })
})

describe('registerServiceWorker', () => {
  it('does nothing where service workers are unavailable', () => {
    expect(() => registerServiceWorker()).not.toThrow()
  })

  it('registers /sw.js', () => {
    const register = vi.fn().mockResolvedValue({})
    setServiceWorker({ register })
    registerServiceWorker()
    expect(register).toHaveBeenCalledWith('/sw.js')
  })

  it('ignores a failed registration', async () => {
    setServiceWorker({ register: vi.fn().mockRejectedValue(new Error('no https')) })
    registerServiceWorker()
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
})
