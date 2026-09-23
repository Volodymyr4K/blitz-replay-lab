import { useSyncExternalStore } from 'react'

export interface Toast {
  id: number
  text: string
  kind: 'ok' | 'err' | 'info'
}

let toasts: Toast[] = []
let seq = 0
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export function toast(text: string, kind: Toast['kind'] = 'ok') {
  const id = ++seq
  toasts = [...toasts, { id, text, kind }]
  emit()
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id)
    emit()
  }, 4000)
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
