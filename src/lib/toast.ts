import { useSyncExternalStore } from 'react'

export interface ToastAction {
  label: string
  run: () => void
}

export interface Toast {
  id: number
  text: string
  kind: 'ok' | 'err' | 'info'
  action?: ToastAction
}

let toasts: Toast[] = []
let seq = 0
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export function dismissToast(id: number) {
  toasts = toasts.filter((t) => t.id !== id)
  emit()
}

export function toast(text: string, kind: Toast['kind'] = 'ok', action?: ToastAction) {
  const id = ++seq
  toasts = [...toasts, { id, text, kind, action }]
  emit()
  // Toasts with an action (undo) stay long enough to be used.
  setTimeout(() => dismissToast(id), action ? 10_000 : 4000)
}

export function useToasts() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => toasts,
  )
}
