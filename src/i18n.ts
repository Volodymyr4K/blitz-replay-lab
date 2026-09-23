import { useCallback, useSyncExternalStore } from 'react'

export type Lang = 'uk' | 'en'

/** Plural forms per Intl.PluralRules; Ukrainian needs one/few/many, English one/other. */
export interface Plural {
  one: string
  few?: string
  many?: string
  other: string
}

const en = {
  tagline: 'WoT Blitz replay analyzer',
  navAnalyzer: 'Analyzer',
  navGuide: 'BPR 2.0 guide',
  navPrivacy: 'Privacy',

  heroTitle: 'Turn replays into team stats',
  heroSub: 'Drop your .wotbreplay files and get BPR 2.0, damage, accuracy and win rate for both teams — in seconds.',
  heroPrivate: 'Runs entirely in your browser. Replays never leave your device.',
  dropTitle: 'Drop replays or a folder here',
  dropHint: 'or click to choose .wotbreplay files',
  chooseFiles: 'Choose files',
  chooseFolder: 'Choose folder',
  whereReplays: 'Where are my replays? On PC: Documents\\TanksBlitz\\replays',
  feature1Title: 'Scrims',
  feature1Text: 'Both teams side by side, with BPR 2.0 and a clear edge summary.',
  feature2Title: 'Personal sessions',
  feature2Text: 'Track your own form across a session, tank by tank and battle by battle.',
  feature3Title: 'Share & export',
  feature3Text: 'One link for your team chat, or an Excel sheet for your notes.',

  modeScrim: 'Scrim',
  modeIndividual: 'Personal',
  modeHint: 'Scrim compares both teams. Personal focuses on the replay author.',
  sessionTitle: 'Session name',
  sessionTitlePh: 'e.g. Scrim vs [CLAN], 23 Sep',
  addReplays: 'Add replays',
  share: 'Share',
  exportXlsx: 'Excel',
  newAnalysis: 'New analysis',
  clearedSession: 'Session cleared',
  undo: 'Undo',

  parsing: 'Reading replays… {done}/{total}',
  addedN: { one: 'Added {n} battle', other: 'Added {n} battles' },
  dupN: { one: '{n} duplicate skipped', other: '{n} duplicates skipped' },
  failedN: { one: '{n} file could not be read', other: '{n} files could not be read' },
  notReplays: 'Only .wotbreplay files are supported',
  storageFull: 'Could not save the session in this browser (storage full or disabled) — it will be lost on reload. Share or export it to keep it.',

  statBattles: 'Battles',
  statRecord: 'Record',
  statWinRate: 'Win rate',
  statOurBpr: 'Our avg BPR',
  statEnemyBpr: 'Enemy avg BPR',
  statAdr: 'Avg ADR',
  statMvp: 'MVP',
  statErrors: 'Errors',

  workspaceHeading: 'Session analysis',
  tabOverview: 'Overview',
  tabOur: 'Our team',
  tabEnemy: 'Enemy team',
  tabBattles: 'Battles',
  tabRoster: 'Roster',

  ourTeam: 'Our team',
  enemyTeam: 'Enemy team',
  avgBpr: 'avg BPR',
  showAll: 'Show all {n}',
  languageLabel: 'Language',
  bprTrendLabel: 'BPR per battle; green win, red loss, dashed line 1.00',
  unknownMap: 'Map #{id}',
  showLess: 'Show fewer',
  vs: 'VS',
  teamCompare: 'Team comparison',
  classMix: 'Tank classes',
  topPlayers: 'Top players',
  summary: 'Summary',
  copy: 'Copy',
  copied: 'Copied',

  sumEdge: 'Our team leads by {v} BPR.',
  sumGap: 'Enemy team leads by {v} BPR.',
  sumDmgAhead: 'We out-damage them by {v} per player per battle.',
  sumDmgBehind: 'They out-damage us by {v} per player per battle.',
  sumRecord: 'Record: {w}W / {l}L / {d}D ({wr} win rate).',
  sumMvp: 'MVP: {nick} — {bpr} BPR, {adr} ADR on {tank}.',
  sumFocusStructure: 'Focus: keep the structure — trades are working.',
  sumFocusFire: 'Focus: tighten focus fire and trade HP more carefully.',
  sumYou: { one: '{nick}: {bpr} BPR, {adr} ADR, {kpr} KPR in {n} battle.', other: '{nick}: {bpr} BPR, {adr} ADR, {kpr} KPR over {n} battles.' },
  sumNext: 'Next target: {adr}+ ADR. Accuracy {h}% hit / {p}% pen.',
  sumSupport: 'Work on support: more spotting/assist and blocked damage.',
  sumDamage: 'Work on damage output — support numbers are already solid.',

  focusPlayer: 'Focus player',
  byTank: 'By tank',
  byBattle: 'Battle by battle',
  bprTrend: 'BPR per battle',

  search: 'Search player…',
  minBattles: 'Min. battles',
  columns: 'Columns',
  playersN: { one: '{n} player', other: '{n} players' },
  battlesN: { one: '{n} battle', other: '{n} battles' },
  noPlayers: 'No players found',

  colRank: '#',
  colPlayer: 'Player',
  colBpr: 'BPR 2.0',
  colBattles: 'Battles',
  colWr: 'WR',
  colTank: 'Main tank',
  tank: 'Tank',
  colAdr: 'ADR',
  colKpr: 'KPR',
  colFrags: 'Frags',
  colDe: 'DE',
  colAssist: 'Assist',
  colBlocked: 'Blocked',
  colAccH: 'Hit %',
  colAccP: 'Pen %',
  colFirepower: 'Firepower',
  colAim: 'AIM',
  colSupport: 'Support',
  colSupremacy: 'Supremacy',
  colIPoints: 'Cap pts',
  colSPoints: 'Seized pts',
  colShots: 'Shots',
  colHits: 'Hits',
  colPens: 'Pens',
  colXp: 'XP',
  colClasses: 'HT/MT/LT/TD',
  colId: 'Account ID',
  colClan: 'Clan',
  colWins: 'Wins',
  clsHT: 'HT',
  clsMT: 'MT',
  clsLT: 'LT',
  clsTD: 'TD',

  battleDate: 'Date',
  battleMap: 'Map',
  battleResult: 'Result',
  battleAuthor: 'Replay by',
  battleDamage: 'Damage (us : them)',
  battleFrags: 'Frags',
  battleDuration: 'Duration',
  battleRoom: 'Mode',
  remove: 'Remove',
  win: 'Win',
  loss: 'Loss',
  draw: 'Draw',
  viaRoster: 'side from roster',
  viaAnchor: 'recorded by the other team — sides matched to the rest of the session',

  rosterTitle: 'Your roster',
  rosterText:
    'By default “our team” is the team of whoever recorded the replay. If replays come from different players (or from the enemy), list your players here — one nickname per line — or your clan tag in brackets like [CLAN]. Each battle is then assigned to the team with more roster members.',
  rosterPh: 'nickname_1\nnickname_2\n[CLAN]',
  rosterImport: 'Import from Excel / CSV / TXT',
  rosterImported: { one: 'Imported {n} name', other: 'Imported {n} names' },
  rosterSaved: 'Roster saved',
  rosterClear: 'Clear',
  save: 'Save',

  modalKpis: 'Key stats',
  modalComponents: 'BPR components',
  modalTanks: 'Tanks',
  modalBattles: 'Battles',
  modalNoBattles: 'Per-battle details are not included in shared links.',
  close: 'Close',

  sharedBanner: 'Shared report',
  sharedCreated: 'created {date}',
  sharedOwn: 'Analyze your own replays',
  sharedBad: 'This share link is broken or incomplete.',
  shareCopied: 'Link copied — paste it anywhere',
  shareTitle: 'Share this report',
  shareText: 'The whole report is packed into the link — no account, no expiry. Anyone with it can view the stats.',
  shareOpen: 'Open',
  shareTrimmed: 'The session is large, so the battle-by-battle list was left out to keep the link short enough for Discord. Totals and ratings are complete.',
  shareTrimmedTanks: 'Per-tank results were left out too; tanks and battle counts are kept.',
  shareTrimmedPlayers: {
    one: '{n} player with a single battle was left out; team totals and averages still include them.',
    other: '{n} players with a single battle were left out; team totals and averages still include them.',
  },
  battlesOmitted: 'The battle list was left out of this link to keep it short. The record and all player stats are complete.',
  shareTooLong: 'Link is {n} characters — over Discord’s 2000 limit without Nitro. Telegram and most other chats are fine.',
  exportDone: 'Excel file saved',

  roomRegular: 'Regular',
  roomTraining: 'Training room',
  roomTournament: 'Tournament',
  roomRating: 'Rating',
  roomOther: 'Mode {n}',

  errorsTitle: 'Files that could not be read',
  crashTitle: 'Something went wrong',
  crashText: 'This page hit an unexpected error. Try again; if it keeps happening, clear the saved session — your replay files are not affected.',
  crashRetry: 'Try again',
  crashReset: 'Clear session and reload',
  crashDetails: 'Technical details',
  unknownError: 'unknown error',
  errNotReplay: 'not a WoT Blitz replay (or the file is damaged)',
  errNoResults: 'no battle results — the replay was saved before the battle ended. Stay until the results screen next time.',
  errTooLarge: 'file is too large to be a replay',
  errCorrupt: 'replay is damaged or uses an unknown format',

  guideTitle: 'BPR 2.0 — how the rating works',
  guideIntro:
    'BPR 2.0 (Blitz Performance Rating) condenses a player’s per-battle averages into one number. Around 1.0 is a solid competitive performance.',
  guideTiers: 'Rating bands',
  guideComponents: 'Components and weights',
  guideFirepower: 'Firepower — average damage and kills per battle. Weight 17.',
  guideAim: 'AIM — hit rate and penetration rate. Weight 3.',
  guideSupport: 'Support — enemies damaged, assisted and blocked damage. Weight 2.',
  guideSupremacy: 'Supremacy — capture points earned and seized. Weight 3.',
  guideNote:
    'The formula is taken from BlitzScrim (github.com/roklimovich/wotblitz-replay-analyzer). Team averages here are weighted by battles played.',
  tierElite: 'Elite',
  tierHigh: 'Strong',
  tierMid: 'Average',
  tierLow: 'Below average',

  privacyTitle: 'Privacy',
  privacyBody1:
    'Replays are read by JavaScript inside your browser. They are never uploaded — there is no server, database or analytics.',
  privacyBody2:
    'The current session (parsed battle results, roster, language) is kept in your browser’s storage (IndexedDB) so it survives a reload and stays in sync across open tabs. “New analysis” deletes it. Browsers may clear site data after long inactivity (Safari: about 7 days), so share or export anything you want to keep.',
  privacyBody3:
    'Share links contain the aggregated report itself (nicknames, account IDs and stats), compressed into the URL. Anyone with the link can read it, and a link cannot be revoked. The site does not verify a shared report — treat it like a screenshot from whoever sent it.',

  footerCredit: 'Replay format research: eigenein/wotbreplay-parser. BPR 2.0: BlitzScrim. Not affiliated with Wargaming.',
} satisfies Record<string, string | Plural>

export type Key = keyof typeof en

/** Every translation key, for consistency checks. */
export const KEYS = Object.keys(en) as Key[]
export type Dict = Record<Key, string | Plural>

const uk: Dict = {
  tagline: 'Аналізатор реплеїв WoT Blitz',
  navAnalyzer: 'Аналізатор',
  navGuide: 'Про BPR 2.0',
  navPrivacy: 'Приватність',

  heroTitle: 'Реплеї → командна статистика',
  heroSub: 'Закинь файли .wotbreplay — і за секунди отримаєш BPR 2.0, шкоду, точність і вінрейт обох команд.',
  heroPrivate: 'Все працює у твоєму браузері. Реплеї нікуди не завантажуються.',
  dropTitle: 'Перетягни сюди реплеї або папку',
  dropHint: 'або натисни, щоб вибрати файли .wotbreplay',
  chooseFiles: 'Вибрати файли',
  chooseFolder: 'Вибрати папку',
  whereReplays: 'Де реплеї? На ПК: Документи\\TanksBlitz\\replays',
  feature1Title: 'Скріми',
  feature1Text: 'Обидві команди поруч, BPR 2.0 і зрозумілий підсумок, хто сильніший.',
  feature2Title: 'Особиста сесія',
  feature2Text: 'Слідкуй за своєю формою по танках і по кожному бою.',
  feature3Title: 'Поділитись і експорт',
  feature3Text: 'Одне посилання в чат команди або Excel-таблиця для нотаток.',

  modeScrim: 'Скрім',
  modeIndividual: 'Особисто',
  modeHint: 'Скрім порівнює дві команди. «Особисто» фокусується на авторі реплеїв.',
  sessionTitle: 'Назва сесії',
  sessionTitlePh: 'напр. Скрім проти [CLAN], 23 вер',
  addReplays: 'Додати реплеї',
  share: 'Поділитись',
  exportXlsx: 'Excel',
  newAnalysis: 'Новий аналіз',
  clearedSession: 'Сесію очищено',
  undo: 'Повернути',

  parsing: 'Читаю реплеї… {done}/{total}',
  addedN: { one: 'Додано {n} бій', few: 'Додано {n} бої', many: 'Додано {n} боїв', other: 'Додано {n} бою' },
  dupN: { one: 'Пропущено {n} дублікат', few: 'Пропущено {n} дублікати', many: 'Пропущено {n} дублікатів', other: 'Пропущено {n} дубліката' },
  failedN: { one: 'Не вдалося прочитати {n} файл', few: 'Не вдалося прочитати {n} файли', many: 'Не вдалося прочитати {n} файлів', other: 'Не вдалося прочитати {n} файлу' },
  notReplays: 'Підтримуються лише файли .wotbreplay',
  storageFull: 'Не вдалося зберегти сесію в браузері (сховище заповнене або вимкнене) — після перезавантаження вона зникне. Щоб зберегти, поділись нею або експортуй.',

  statBattles: 'Боїв',
  statRecord: 'Рахунок',
  statWinRate: 'Вінрейт',
  statOurBpr: 'Наш сер. BPR',
  statEnemyBpr: 'BPR суперника',
  statAdr: 'Сер. шкода',
  statMvp: 'MVP',
  statErrors: 'Помилки',

  workspaceHeading: 'Аналіз сесії',
  tabOverview: 'Огляд',
  tabOur: 'Наша команда',
  tabEnemy: 'Суперники',
  tabBattles: 'Бої',
  tabRoster: 'Склад',

  ourTeam: 'Наша команда',
  enemyTeam: 'Суперники',
  avgBpr: 'сер. BPR',
  showAll: 'Показати всіх ({n})',
  languageLabel: 'Мова',
  bprTrendLabel: 'BPR за кожен бій; зелений — перемога, червоний — поразка, пунктир — 1.00',
  unknownMap: 'Мапа #{id}',
  showLess: 'Згорнути',
  vs: 'VS',
  teamCompare: 'Порівняння команд',
  classMix: 'Класи техніки',
  topPlayers: 'Топ гравців',
  summary: 'Підсумок',
  copy: 'Копіювати',
  copied: 'Скопійовано',

  sumEdge: 'Наша команда попереду на {v} BPR.',
  sumGap: 'Суперник попереду на {v} BPR.',
  sumDmgAhead: 'Ми наносимо на {v} більше шкоди на гравця за бій.',
  sumDmgBehind: 'Суперник наносить на {v} більше шкоди на гравця за бій.',
  sumRecord: 'Рахунок: {w} перемог / {l} поразок / {d} нічиїх (вінрейт {wr}).',
  sumMvp: 'MVP: {nick} — {bpr} BPR, {adr} шкоди на {tank}.',
  sumFocusStructure: 'Фокус: тримайте структуру — розміни працюють.',
  sumFocusFire: 'Фокус: більше фокус-вогню і акуратніші розміни ХП.',
  sumYou: {
    one: '{nick}: {bpr} BPR, {adr} шкоди, {kpr} фрагів за бій ({n} бій).',
    few: '{nick}: {bpr} BPR, {adr} шкоди, {kpr} фрагів за бій ({n} бої).',
    many: '{nick}: {bpr} BPR, {adr} шкоди, {kpr} фрагів за бій ({n} боїв).',
    other: '{nick}: {bpr} BPR, {adr} шкоди, {kpr} фрагів за бій ({n} бою).',
  },
  sumNext: 'Наступна ціль: {adr}+ шкоди. Точність: {h}% влучань / {p}% пробиттів.',
  sumSupport: 'Попрацюй над підтримкою: більше засвіту/асисту і заблокованої шкоди.',
  sumDamage: 'Попрацюй над шкодою — з підтримкою вже все добре.',

  focusPlayer: 'Гравець у фокусі',
  byTank: 'По танках',
  byBattle: 'По боях',
  bprTrend: 'BPR за бій',

  search: 'Пошук гравця…',
  minBattles: 'Мін. боїв',
  columns: 'Колонки',
  playersN: { one: '{n} гравець', few: '{n} гравці', many: '{n} гравців', other: '{n} гравця' },
  battlesN: { one: '{n} бій', few: '{n} бої', many: '{n} боїв', other: '{n} бою' },
  noPlayers: 'Гравців не знайдено',

  colRank: '#',
  colPlayer: 'Гравець',
  colBpr: 'BPR 2.0',
  colBattles: 'Бої',
  colWr: 'ВР',
  colTank: 'Основний танк',
  tank: 'Танк',
  colAdr: 'Шкода',
  colKpr: 'Фраги/бій',
  colFrags: 'Фраги',
  colDe: 'Пошкодж.',
  colAssist: 'Асист',
  colBlocked: 'Блок',
  colAccH: 'Влуч. %',
  colAccP: 'Проб. %',
  colFirepower: 'Вогонь',
  colAim: 'Точність',
  colSupport: 'Підтримка',
  colSupremacy: 'Контроль',
  colIPoints: 'Очки захоп.',
  colSPoints: 'Очки відб.',
  colShots: 'Постріли',
  colHits: 'Влучання',
  colPens: 'Пробиття',
  colXp: 'Досвід',
  colClasses: 'ТТ/СТ/ЛТ/ПТ',
  colId: 'ID акаунта',
  colClan: 'Клан',
  colWins: 'Перемоги',
  clsHT: 'ТТ',
  clsMT: 'СТ',
  clsLT: 'ЛТ',
  clsTD: 'ПТ',

  battleDate: 'Дата',
  battleMap: 'Мапа',
  battleResult: 'Результат',
  battleAuthor: 'Реплей від',
  battleDamage: 'Шкода (ми : вони)',
  battleFrags: 'Фраги',
  battleDuration: 'Тривалість',
  battleRoom: 'Режим',
  remove: 'Прибрати',
  win: 'Перемога',
  loss: 'Поразка',
  draw: 'Нічия',
  viaRoster: 'сторона за складом',
  viaAnchor: 'реплей записано з іншої сторони — сторони узгоджено з рештою сесії',

  rosterTitle: 'Склад вашої команди',
  rosterText:
    'За замовчуванням «наша команда» — це команда того, хто записав реплей. Якщо реплеї від різних гравців (або від суперника), впиши сюди своїх гравців — по одному ніку в рядку — або клан-тег у дужках, як [CLAN]. Тоді кожен бій віднесеться до команди, де більше гравців зі складу.',
  rosterPh: 'nickname_1\nnickname_2\n[CLAN]',
  rosterImport: 'Імпорт з Excel / CSV / TXT',
  rosterImported: { one: 'Імпортовано {n} нік', few: 'Імпортовано {n} ніки', many: 'Імпортовано {n} ніків', other: 'Імпортовано {n} ніка' },
  rosterSaved: 'Склад збережено',
  rosterClear: 'Очистити',
  save: 'Зберегти',

  modalKpis: 'Основне',
  modalComponents: 'Складові BPR',
  modalTanks: 'Танки',
  modalBattles: 'Бої',
  modalNoBattles: 'Деталі по боях не входять у посилання для шерингу.',
  close: 'Закрити',

  sharedBanner: 'Звіт по посиланню',
  sharedCreated: 'створено {date}',
  sharedOwn: 'Проаналізувати свої реплеї',
  sharedBad: 'Посилання пошкоджене або неповне.',
  shareCopied: 'Посилання скопійовано — встав куди завгодно',
  shareTitle: 'Поділитися звітом',
  shareText: 'Весь звіт запакований у посилання — без акаунта і без терміну дії. Будь-хто з ним побачить статистику.',
  shareOpen: 'Відкрити',
  shareTrimmed: 'Сесія велика, тож список боїв не включено, щоб посилання влізло в Discord. Підсумки й рейтинги — повні.',
  shareTrimmedTanks: 'Також не включено результати по кожному танку; танки й кількість боїв на них збережено.',
  shareTrimmedPlayers: {
    one: 'Не включено {n} гравця з одним боєм. Підсумки й середні команд його все одно враховують.',
    few: 'Не включено {n} гравців з одним боєм. Підсумки й середні команд їх усе одно враховують.',
    many: 'Не включено {n} гравців з одним боєм. Підсумки й середні команд їх усе одно враховують.',
    other: 'Не включено {n} гравця з одним боєм. Підсумки й середні команд їх усе одно враховують.',
  },
  battlesOmitted: 'Список боїв не включено в це посилання, щоб воно було коротким. Рахунок і вся статистика гравців — повні.',
  shareTooLong: 'Посилання має {n} символів — більше за ліміт Discord без Nitro (2000). Telegram та більшість інших чатів приймуть.',
  exportDone: 'Excel-файл збережено',

  roomRegular: 'Звичайний',
  roomTraining: 'Тренувальна кімната',
  roomTournament: 'Турнір',
  roomRating: 'Рейтинг',
  roomOther: 'Режим {n}',

  errorsTitle: 'Файли, які не вдалося прочитати',
  crashTitle: 'Щось пішло не так',
  crashText: 'Сторінка натрапила на неочікувану помилку. Спробуй ще раз; якщо повторюється — очисти збережену сесію. Самі файли реплеїв це не зачіпає.',
  crashRetry: 'Спробувати ще раз',
  crashReset: 'Очистити сесію і перезавантажити',
  crashDetails: 'Технічні деталі',
  unknownError: 'невідома помилка',
  errNotReplay: 'це не реплей WoT Blitz (або файл пошкоджений)',
  errNoResults: 'немає результатів бою — реплей збережено до кінця бою. Наступного разу дочекайся екрана результатів.',
  errTooLarge: 'файл завеликий для реплею',
  errCorrupt: 'реплей пошкоджений або має невідомий формат',

  guideTitle: 'BPR 2.0 — як рахується рейтинг',
  guideIntro:
    'BPR 2.0 (Blitz Performance Rating) зводить середні показники гравця за бій в одне число. Близько 1.0 — це впевнена гра на змагальному рівні.',
  guideTiers: 'Діапазони',
  guideComponents: 'Складові і ваги',
  guideFirepower: 'Вогонь — середня шкода і фраги за бій. Вага 17.',
  guideAim: 'Точність — відсоток влучань і пробиттів. Вага 3.',
  guideSupport: 'Підтримка — кількість пошкоджених ворогів, асист і заблокована шкода. Вага 2.',
  guideSupremacy: 'Контроль — очки захоплення, набрані й відбиті. Вага 3.',
  guideNote:
    'Формулу взято з BlitzScrim (github.com/roklimovich/wotblitz-replay-analyzer). Середні по команді тут зважені за кількістю боїв.',
  tierElite: 'Еліта',
  tierHigh: 'Сильно',
  tierMid: 'Середньо',
  tierLow: 'Нижче середнього',

  privacyTitle: 'Приватність',
  privacyBody1:
    'Реплеї читає JavaScript прямо у твоєму браузері. Вони нікуди не відправляються — тут немає сервера, бази даних чи аналітики.',
  privacyBody2:
    'Поточна сесія (розібрані результати боїв, склад, мова) зберігається в сховищі браузера (IndexedDB), щоб пережити перезавантаження, і синхронізується між відкритими вкладками. «Новий аналіз» її видаляє. Браузери можуть очищати дані сайтів після тривалої неактивності (Safari — приблизно через 7 днів), тож те, що хочеш зберегти, поширюй посиланням або експортуй.',
  privacyBody3:
    'Посилання для шерингу містить сам звіт (ніки, ID акаунтів і статистику), стиснутий в URL. Будь-хто з посиланням може його прочитати, і відкликати посилання неможливо. Сайт не перевіряє дані в чужому звіті — сприймай його як скріншот від того, хто надіслав.',

  footerCredit: 'Формат реплеїв: eigenein/wotbreplay-parser. BPR 2.0: BlitzScrim. Не пов’язано з Wargaming.',
}

const dicts: Record<Lang, Dict> = { en, uk }
const LANG_KEY = 'bra:lang'

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(LANG_KEY)
    if (saved === 'uk' || saved === 'en') return saved
  } catch {
    /* storage unavailable */
  }
  return typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('uk') ? 'uk' : 'en'
}

let current: Lang = initialLang()
const listeners = new Set<() => void>()

export function setLang(lang: Lang) {
  current = lang
  document.documentElement.lang = lang
  try {
    localStorage.setItem(LANG_KEY, lang)
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l())
}

export function getLang(): Lang {
  return current
}

export function useLang(): Lang {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => current,
  )
}

export type T = (key: Key, vars?: Record<string, string | number>) => string

export const dictionaries: Readonly<Record<Lang, Dict>> = dicts

const pluralRules = new Map<Lang, Intl.PluralRules>()

export function translate(lang: Lang, key: Key, vars?: Record<string, string | number>): string {
  const entry: string | Plural = dicts[lang][key] ?? en[key]
  let s: string
  if (typeof entry === 'string') s = entry
  else {
    let rules = pluralRules.get(lang)
    if (!rules) pluralRules.set(lang, (rules = new Intl.PluralRules(lang)))
    const form = rules.select(Number(vars?.n ?? 0)) as keyof Plural
    s = entry[form] ?? entry.other
  }
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v))
  return s
}

export function useT(): T {
  const lang = useLang()
  return useCallback<T>((key, vars) => translate(lang, key, vars), [lang])
}

if (typeof document !== 'undefined') document.documentElement.lang = current
