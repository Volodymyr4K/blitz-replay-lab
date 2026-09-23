import type { T } from '../i18n'

export function roomLabel(room: number, t: T) {
  switch (room) {
    case 1:
      return t('roomRegular')
    case 2:
      return t('roomTraining')
    case 4:
    case 5:
      return t('roomTournament')
    case 7:
      return t('roomRating')
    default:
      return t('roomOther', { n: room })
  }
}

const ERROR_KEYS = {
  not_replay: 'errNotReplay',
  no_results: 'errNoResults',
  too_large: 'errTooLarge',
  corrupt: 'errCorrupt',
} as const

/** Parse failures are stored as codes (see ReplayError); older sessions may hold raw text. */
export function errorText(reason: string, t: T) {
  const key = ERROR_KEYS[reason as keyof typeof ERROR_KEYS]
  return key ? t(key) : reason || t('unknownError')
}
