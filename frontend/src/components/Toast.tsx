import { useCallback, useEffect, useRef, useState } from 'react'

type ToastKind = 'success' | 'error'

/** A small toast plus an `attempt` helper that runs an action and reports success or failure. */
export function useToast() {
  const [toast, setToast] = useState<{ text: string; kind: ToastKind } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>()

  const notify = useCallback((text: string, kind: ToastKind = 'success') => {
    clearTimeout(timer.current)
    setToast({ text, kind })
    timer.current = setTimeout(() => setToast(null), 3500)
  }, [])

  useEffect(() => () => clearTimeout(timer.current), [])

  const attempt = useCallback(
    async (action: () => Promise<unknown>, success?: string) => {
      try {
        await action()
        if (success) notify(success)
        return true
      } catch (error) {
        notify((error as Error).message, 'error')
        return false
      }
    },
    [notify],
  )

  const element = toast && (
    <div
      role={toast.kind === 'error' ? 'alert' : 'status'}
      className={`fixed inset-x-4 top-4 z-[60] mx-auto max-w-md animate-pop rounded-3xl border-b-4 px-5 py-3 text-center text-base font-bold text-white shadow-pop ${
        toast.kind === 'success' ? 'border-leaf-600 bg-leaf-500' : 'border-rose-700 bg-rose-500'
      }`}
    >
      {toast.kind === 'success' ? '🎉 ' : '🙈 '}
      {toast.text}
    </div>
  )

  return { toast: element, notify, attempt }
}
