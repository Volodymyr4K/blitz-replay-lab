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
