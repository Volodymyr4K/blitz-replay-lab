import type { ReactNode } from 'react'
import { bprTier } from '../analysis/bpr'
import type { Outcome } from '../analysis/analyze'
import type { T } from '../i18n'
import { fixed } from '../lib/format'

export function Bpr({ value, size = 'md' }: { value: number; size?: 'sm' | 'md' | 'lg' }) {
  return <span className={`bpr bpr-${bprTier(value)} bpr-${size}`}>{fixed(value)}</span>
}

export function OutcomeTag({ outcome, t }: { outcome: Outcome; t: T }) {
  return <span className={`outcome ${outcome}`}>{t(outcome)}</span>
}

export function Clan({ tag }: { tag: string | null }) {
  return tag ? <span className="clan">[{tag}]</span> : null
}

export function Meter({ value, max, tone = 'accent' }: { value: number; max: number; tone?: 'accent' | 'our' | 'enemy' }) {
  const w = max > 0 ? Math.max(0, Math.min(1, value / max)) * 100 : 0
  return (
    <span className={`meter ${tone}`}>
      <span style={{ width: `${w}%` }} />
    </span>
  )
}

export function Panel({ title, action, children, className = '' }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`panel ${className}`}>
      {(title || action) && (
        <header className="panel-head">
          {title && <h3>{title}</h3>}
          {action}
        </header>
      )}
      {children}
    </section>
  )
}
