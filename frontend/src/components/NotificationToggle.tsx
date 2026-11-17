import { useEffect, useState } from 'react'
import { fetchPushConfig, subscribePush, unsubscribePush } from '../api'
import { currentSubscription, isIosWithoutHomeScreen, pushSupported, urlBase64ToUint8Array } from '../lib/push'
import type { PushSubscriptionInput } from '../types'

interface NotificationToggleProps {
  onNotify: (text: string, kind?: 'success' | 'error') => void
}

/** Turns phone notifications on or off for this device. Shows nothing when the server or the browser cannot send them. */
export default function NotificationToggle({ onNotify }: NotificationToggleProps) {
  // undefined while the server config is loading; null when push is not configured on the server.
  const [publicKey, setPublicKey] = useState<string | null | undefined>(undefined)
  const [subscribed, setSubscribed] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const load = async () => {
      try {
        const { public_key } = await fetchPushConfig()
        setPublicKey(public_key)
        if (public_key && pushSupported()) setSubscribed(Boolean(await currentSubscription()))
      } catch {
        setPublicKey(null)
      }
    }
    void load()
  }, [])

  const turnOn = async () => {
    if ((await Notification.requestPermission()) !== 'granted') {
      onNotify('Notifications are blocked for this app. Allow them in your browser or phone settings, then try again.', 'error')
      return
    }
    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey!) })
    try {
      await subscribePush(subscription.toJSON() as PushSubscriptionInput)
    } catch (error) {
      // Keep the browser and the server in step: no server copy means no subscription here either.
      await subscription.unsubscribe()
      throw error
    }
    setSubscribed(true)
    onNotify('Notifications are on! 🔔')
  }

  const turnOff = async () => {
    const subscription = await currentSubscription()
    if (subscription) {
      await unsubscribePush(subscription.endpoint)
      await subscription.unsubscribe()
    }
    setSubscribed(false)
    onNotify('Notifications are off.')
  }

  const toggle = async () => {
    setBusy(true)
    try {
      await (subscribed ? turnOff() : turnOn())
    } catch {
      onNotify("Couldn't update notifications. Please try again.", 'error')
    } finally {
      setBusy(false)
    }
  }

  if (!publicKey) return null

  if (isIosWithoutHomeScreen()) {
    return (
      <section className="card mb-6 flex items-start gap-3 border-ocean-200" aria-labelledby="notifications-heading">
        <span className="text-4xl" aria-hidden="true">
          📲
        </span>
        <div className="min-w-0">
          <h2 id="notifications-heading" className="text-2xl text-grape-900">
            Phone notifications
          </h2>
          <p className="mt-1 text-grape-700">
            On iPhone, add this app to your Home Screen first (Share → Add to Home Screen), then open it from there to turn on notifications.
          </p>
        </div>
      </section>
    )
  }

  if (!pushSupported()) return null

  return (
    <section className="card mb-6 border-ocean-200" aria-labelledby="notifications-heading">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="text-4xl" aria-hidden="true">
            {subscribed ? '🔔' : '🔕'}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="notifications-heading" className="text-2xl text-grape-900">
                Phone notifications
              </h2>
              <span className={`chip ${subscribed ? 'bg-leaf-100 text-leaf-600' : 'bg-grape-50 text-grape-700'}`}>{subscribed ? 'On' : 'Off'}</span>
            </div>
            <p className="mt-1 text-grape-700">
              {subscribed
                ? 'This phone pings you about new missions, finished tasks, approvals and reminders.'
                : 'Get a ping about new missions, finished tasks, approvals and reminders.'}
            </p>
          </div>
        </div>
        <button type="button" className={`${subscribed ? 'btn-ghost' : 'btn-success'} w-full shrink-0 sm:w-auto`} disabled={busy} onClick={toggle}>
          {subscribed ? '🔕 Turn off' : '🔔 Turn on'}
        </button>
      </div>
    </section>
  )
}
