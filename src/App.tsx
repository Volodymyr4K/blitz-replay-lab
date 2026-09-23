import { useEffect, useMemo, useState } from 'react'
import { analyze } from './analysis/analyze'
import { bprTier } from './analysis/bpr'
import { decodeReport, type SharedReport } from './analysis/share'
import { setLang, useLang, useT, type Lang, type T } from './i18n'
import { date } from './lib/format'
import { errorText } from './lib/labels'
import { dismissToast, useToasts } from './lib/toast'
import { useStore } from './store'
import { Panel } from './ui/bits'
import { Dropzone } from './ui/Dropzone'
import { ErrorBoundary } from './ui/ErrorBoundary'
import { TrimNotes, Workspace } from './ui/Workspace'

const APP_NAME = 'Blitz Replay Lab'
const REPO_URL = 'https://github.com/Volodymyr4K/blitz-replay-lab'

type Route = { page: 'home' } | { page: 'guide' } | { page: 'privacy' } | { page: 'shared'; payload: string }

function parseRoute(hash: string): Route {
  const h = hash.replace(/^#\/?/, '')
  if (h.startsWith('s/')) return { page: 'shared', payload: h.slice(2) }
  if (h === 'bpr') return { page: 'guide' }
  if (h === 'privacy') return { page: 'privacy' }
  return { page: 'home' }
}

function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(location.hash))
  useEffect(() => {
    const on = () => {
      setRoute(parseRoute(location.hash))
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return route
}

export default function App() {
  const t = useT()
  const lang = useLang()
  const route = useRoute()
  const { progress, storageFull, session } = useStore()
  useDocumentTitle(route, session.title, t)

  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href="#/">
          <Logo />
          <span>
            <b>{APP_NAME}</b>
            <small>{t('tagline')}</small>
          </span>
        </a>
        <nav className="nav">
          <a href="#/" className={route.page === 'home' ? 'on' : ''}>
            {t('navAnalyzer')}
          </a>
          <a href="#/bpr" className={route.page === 'guide' ? 'on' : ''}>
            {t('navGuide')}
          </a>
        </nav>
        <div className="lang" role="group" aria-label="Language">
          {(['uk', 'en'] as Lang[]).map((l) => (
            <button key={l} className={lang === l ? 'on' : ''} onClick={() => setLang(l)}>
              {l.toUpperCase()}
            </button>
          ))}
        </div>
        {progress && (
          <div className="progress" style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }} />
        )}
      </header>

      {storageFull && <div className="banner warn">{t('storageFull')}</div>}

      <main className="main">
        {/* Keyed by page so navigating away from a crashed view recovers. */}
        <ErrorBoundary key={route.page}>
          {route.page === 'home' && <Home t={t} />}
          {route.page === 'shared' && <Shared payload={route.payload} t={t} />}
          {route.page === 'guide' && <Guide t={t} />}
          {route.page === 'privacy' && <Privacy t={t} />}
        </ErrorBoundary>
      </main>

      <footer className="footer">
        <span>{t('footerCredit')}</span>
        <span className="footer-links">
          <a href="#/bpr">{t('navGuide')}</a>
          <a href="#/privacy">{t('navPrivacy')}</a>
          <a href={REPO_URL} target="_blank" rel="noreferrer">
            GitHub
          </a>
        </span>
      </footer>

      {progress && (
        <div className="veil" aria-live="polite">
          <div className="veil-card">
            <div className="spinner" />
            {t('parsing', { done: progress.done, total: progress.total })}
          </div>
        </div>
      )}
      <Toasts />
    </div>
  )
}

function useDocumentTitle(route: Route, sessionTitle: string, t: T) {
  useEffect(() => {
    let page = ''
    if (route.page === 'home') page = sessionTitle
    else if (route.page === 'guide') page = t('navGuide')
    else if (route.page === 'privacy') page = t('navPrivacy')
    else {
      try {
        page = decodeReport(route.payload).title || t('sharedBanner')
      } catch {
        page = t('sharedBanner')
      }
    }
    document.title = page ? `${page} · ${APP_NAME}` : APP_NAME
  }, [route, sessionTitle, t])
}

function Home({ t }: { t: T }) {
  const { session } = useStore()
  const analysis = useMemo(() => analyze(session.battles, { roster: session.roster }), [session.battles, session.roster])

  if (!session.battles.length) return <Landing t={t} />
  return (
    <Workspace
      analysis={analysis}
      mode={session.mode}
      title={session.title}
      t={t}
      local={{ battles: session.battles, errors: session.errors, roster: session.roster }}
    />
  )
}

function Landing({ t }: { t: T }) {
  const { session } = useStore()
  return (
    <div className="landing">
      <section className="hero">
        <h1>{t('heroTitle')}</h1>
        <p className="lead">{t('heroSub')}</p>
        <p className="private">
          <LockIcon /> {t('heroPrivate')}
        </p>
      </section>
      <Dropzone />
      <p className="muted center small">{t('whereReplays')}</p>
      {session.errors.length > 0 && (
        <Panel title={t('errorsTitle')} className="errors">
          <ul className="error-list">
            {session.errors.map((e, i) => (
              <li key={i}>
                <b>{e.file}</b> — {errorText(e.reason, t)}
              </li>
            ))}
          </ul>
        </Panel>
      )}
      <div className="features">
        {(
          [
            ['feature1Title', 'feature1Text'],
            ['feature2Title', 'feature2Text'],
            ['feature3Title', 'feature3Text'],
          ] as const
        ).map(([h, p]) => (
          <div className="feature" key={h}>
            <h2>{t(h)}</h2>
            <p className="muted">{t(p)}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function Shared({ payload, t }: { payload: string; t: T }) {
  const lang = useLang()
  const report = useMemo<SharedReport | null>(() => {
    try {
      return decodeReport(payload)
    } catch {
      return null
    }
  }, [payload])

  if (!report) {
    return (
      <div className="page narrow">
        <Panel>
          <p>{t('sharedBad')}</p>
          <a className="btn primary" href="#/">
            {t('sharedOwn')}
          </a>
        </Panel>
      </div>
    )
  }
  return (
    <>
      <div className="shared-bar">
        <div>
          <span className="eyebrow">{t('sharedBanner')}</span>
          <h1>{report.title || APP_NAME}</h1>
          <span className="muted small">{t('sharedCreated', { date: date(report.createdAt / 1000, lang) })}</span>
          <TrimNotes omitted={report.analysis.omitted} t={t} />
        </div>
        <a className="btn" href="#/">
          {t('sharedOwn')}
        </a>
      </div>
      <Workspace analysis={report.analysis} mode={report.mode} title={report.title} t={t} />
    </>
  )
}

function Guide({ t }: { t: T }) {
  const tiers = [
    { range: '≥ 1.10', key: 'tierElite', v: 1.2 },
    { range: '0.90 – 1.09', key: 'tierHigh', v: 1 },
    { range: '0.70 – 0.89', key: 'tierMid', v: 0.8 },
    { range: '< 0.70', key: 'tierLow', v: 0.5 },
  ] as const
  return (
    <article className="page narrow prose">
      <h1>{t('guideTitle')}</h1>
      <p className="lead">{t('guideIntro')}</p>
      <h2>{t('guideTiers')}</h2>
      <div className="tiers">
        {tiers.map((x) => (
          <div key={x.key} className="tier">
            <span className={`bpr bpr-${bprTier(x.v)} bpr-md`}>{x.range}</span>
            <span>{t(x.key)}</span>
          </div>
        ))}
      </div>
      <h2>{t('guideComponents')}</h2>
      <ul>
        <li>{t('guideFirepower')}</li>
        <li>{t('guideAim')}</li>
        <li>{t('guideSupport')}</li>
        <li>{t('guideSupremacy')}</li>
      </ul>
      <pre className="formula">{`Firepower = ((100 + ADR) × (1 + KPR)^(1/7) − 777) / 20
AIM       = ((1 + Hit) × (1 + Pen) − 0.9) / 0.029
Support   = ((1 + DE)² × (200 + Assist)² × (400 + Blocked))^(1/3) / 19
Supremacy = √(40 + iPoints + sPoints) / 0.13

BPR 2.0   = (17·Firepower + 3·AIM + 2·Support + 3·Supremacy) / 25 / 76`}</pre>
      <p className="muted">{t('guideNote')}</p>
    </article>
  )
}

function Privacy({ t }: { t: T }) {
  return (
    <article className="page narrow prose">
      <h1>{t('privacyTitle')}</h1>
      <p>{t('privacyBody1')}</p>
      <p>{t('privacyBody2')}</p>
      <p>{t('privacyBody3')}</p>
    </article>
  )
}

function Toasts() {
  const toasts = useToasts()
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((x) => (
        <div key={x.id} className={`toast ${x.kind}`}>
          <span>{x.text}</span>
          {x.action && (
            <button
              className="toast-action"
              onClick={() => {
                x.action!.run()
                dismissToast(x.id)
              }}
            >
              {x.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

function Logo() {
  return (
    <svg className="logo" viewBox="0 0 32 32" aria-hidden="true">
      <path d="M16 2 28.1 9v14L16 30 3.9 23V9z" className="logo-hex" />
      <path d="M17.5 7 10 17.5h5.2L14 25l8-10.8h-5.3z" className="logo-bolt" />
    </svg>
  )
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" className="inline-icon">
      <path d="M7 10V7a5 5 0 0 1 10 0v3M5 10h14v11H5z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  )
}
