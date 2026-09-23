import { Component, type ReactNode } from 'react'
import { getLang, translate } from '../i18n'
import { resetStorage } from '../store'

interface State {
  error: Error | null
}

/**
 * Last line of defence: a render error shows a way out instead of a blank page.
 * Clearing the saved session matters — if stored data is what breaks rendering,
 * a plain reload would fail the same way forever.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error(error)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    const t = (key: Parameters<typeof translate>[1]) => translate(getLang(), key)
    return (
      <div className="page narrow">
        <section className="panel crash" role="alert">
          <h1>{t('crashTitle')}</h1>
          <p className="muted">{t('crashText')}</p>
          <div className="row-actions">
            <button className="btn primary" onClick={() => this.setState({ error: null })}>
              {t('crashRetry')}
            </button>
            <button
              className="btn"
              onClick={async () => {
                await resetStorage()
                location.hash = '#/'
                location.reload()
              }}
            >
              {t('crashReset')}
            </button>
          </div>
          <details>
            <summary className="muted small">{t('crashDetails')}</summary>
            <pre className="crash-detail">{error.message}</pre>
          </details>
        </section>
      </div>
    )
  }
}
