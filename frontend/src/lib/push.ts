/** Web Push needs the Notification, Service Worker and Push APIs all at once. */
export const pushSupported = () => 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window

/** iPhone and iPad only allow web push for apps added to the Home Screen. */
export const isIosWithoutHomeScreen = () => /iPhone|iPad|iPod/.test(navigator.userAgent) && !window.matchMedia('(display-mode: standalone)').matches

/** The VAPID public key comes as URL-safe base64 without padding; pushManager.subscribe wants raw bytes. */
export const urlBase64ToUint8Array = (base64: string) => {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (char) => char.charCodeAt(0))
}

/** The push subscription this browser holds for the app, if any. */
export const currentSubscription = async () => {
  const registration = await navigator.serviceWorker.getRegistration()
  return registration ? registration.pushManager.getSubscription() : null
}

/** Registers public/sw.js so it can show pushed notifications. Failure is harmless: the app works without it. */
export const registerServiceWorker = () => {
  if (!('serviceWorker' in navigator)) return
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {})
}
