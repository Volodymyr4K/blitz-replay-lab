import { useEffect, useRef, type ReactNode } from 'react'

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Accessible dialog shell: moves focus inside on open, keeps Tab within the dialog,
 * closes on Escape or a backdrop click, locks page scroll, and returns focus to
 * whatever opened it.
 */
export function Modal({ label, onClose, className = '', children }: { label: string; onClose: () => void; className?: string; children: ReactNode }) {
  const dialog = useRef<HTMLDivElement>(null)
  // Latest onClose without re-running the focus effect when the parent re-renders.
  const close = useRef(onClose)
  useEffect(() => {
    close.current = onClose
  })

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    dialog.current?.focus()
    document.body.classList.add('modal-open')

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        close.current()
        return
      }
      if (e.key !== 'Tab' || !dialog.current) return
      const items = [...dialog.current.querySelectorAll<HTMLElement>(FOCUSABLE)]
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.classList.remove('modal-open')
      opener?.focus?.()
    }
  }, [])

  return (
    <div className="modal-backdrop" onClick={() => close.current()}>
      <div
        ref={dialog}
        className={`modal ${className}`}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}
