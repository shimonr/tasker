import { ReactNode, useEffect } from 'react'

interface ModalProps {
  title: string
  subtitle?: string
  onClose: () => void
  children: ReactNode
}

/** A dialog that is a bottom sheet on phones and a centered card on larger screens. */
export default function Modal({ title, subtitle, onClose, children }: ModalProps) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-grape-900/40 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
        className="safe-bottom flex max-h-[90vh] w-full max-w-2xl animate-pop flex-col overflow-hidden rounded-t-[32px] border-4 border-white bg-white shadow-pop sm:rounded-[32px]"
      >
        <div className="flex items-start justify-between gap-4 border-b-2 border-grape-50 px-5 py-4 sm:px-6">
          <div>
            {subtitle && <p className="text-sm font-semibold uppercase tracking-wider text-bubble-500">{subtitle}</p>}
            <h3 className="text-xl text-grape-900">{title}</h3>
          </div>
          <button type="button" onClick={onClose} className="btn-ghost btn-sm" aria-label="Close">
            ✖️
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4 sm:px-6">{children}</div>
      </div>
    </div>
  )
}
