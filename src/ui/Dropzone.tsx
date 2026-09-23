import { useRef, useState, type DragEvent } from 'react'
import { useT } from '../i18n'
import { filesFromDrop, isReplay } from '../lib/files'
import { toast } from '../lib/toast'
import { importReplays } from '../store'

async function ingest(files: File[], t: ReturnType<typeof useT>) {
  const replays = files.filter((f) => isReplay(f.name))
  if (!replays.length) {
    toast(t('notReplays'), 'err')
    return
  }
  const r = await importReplays(replays)
  if (r.added) toast(t('addedN', { n: r.added }), 'ok')
  if (r.duplicates) toast(t('dupN', { n: r.duplicates }), 'info')
  if (r.failed) toast(t('failedN', { n: r.failed }), 'err')
}

export function Dropzone({ compact = false }: { compact?: boolean }) {
  const t = useT()
  const files = useRef<HTMLInputElement>(null)
  const folder = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)

  const onDrop = async (e: DragEvent) => {
    e.preventDefault()
    setOver(false)
    ingest(await filesFromDrop(e.dataTransfer), t)
  }

  const pick = (input: HTMLInputElement | null) => {
    if (!input?.files) return
    const list = [...input.files]
    input.value = ''
    ingest(list, t)
  }

  return (
    <div
      className={`dropzone${over ? ' over' : ''}${compact ? ' compact' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('button')) return
        files.current?.click()
      }}
    >
      <input ref={files} type="file" accept=".wotbreplay" multiple hidden onChange={() => pick(files.current)} />
      <input
        ref={folder}
        type="file"
        hidden
        onChange={() => pick(folder.current)}
        {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
      />
      <svg className="dz-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 16V4m0 0-4 4m4-4 4 4M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" />
      </svg>
      <div className="dz-text">
        <strong>{t('dropTitle')}</strong>
        {!compact && <span>{t('dropHint')}</span>}
      </div>
      <div className="dz-actions">
        <button className="btn primary" onClick={() => files.current?.click()}>
          {t('chooseFiles')}
        </button>
        <button className="btn" onClick={() => folder.current?.click()}>
          {t('chooseFolder')}
        </button>
      </div>
    </div>
  )
}
