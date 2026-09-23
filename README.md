# Blitz Replay Lab

Аналізатор реплеїв **World of Tanks Blitz**: закидаєш `.wotbreplay` — отримуєш BPR 2.0, шкоду, точність, вінрейт і розклад по танках для обох команд.

Все працює **у браузері**: реплеї нікуди не завантажуються, сервера немає, хостинг — безкоштовний GitHub Pages.

## Можливості

- **Скрім** — дві команди поруч, порівняння середніх, топ гравців, класи техніки, автоматичний підсумок.
- **Особисто** — фокус на авторі реплеїв: BPR по кожному бою, статистика по танках.
- **Склад команди** — список ніків або `[CLAN]`-тегів, щоб правильно визначати «нашу» сторону, навіть якщо реплеї записані різними гравцями (або суперником). Можна імпортувати з Excel/CSV/TXT.
- **Сесія накопичується**: докидаєш реплеї після кожного бою, дублікати відсіюються автоматично, окремі бої можна прибрати.
- **Поділитися** — весь звіт стискається в посилання. Без акаунтів і без терміну дії.
- **Excel-експорт** — два аркуші (наша команда / суперники).
- Українська та англійська мови, адаптив під телефон.

## Як це працює

```
.wotbreplay (ZIP)
  └─ battle_results.dat   ← Python pickle: (arena_id, protobuf bytes)
        └─ protobuf        ← гравці, команди, шкода, постріли, очки захоплення…
```

- `src/parser/` — розбір ZIP → pickle → protobuf на чистому TypeScript (без Rust і без сервера).
- `src/analysis/` — агрегація по гравцях, BPR 2.0, кодування звіту в посилання.
- `src/parse.worker.ts` — розбір у Web Worker, тож 200+ реплеїв не підвішують сторінку.
- `src/data/` — назви/типи/рівні танків і назви мап.

## Розробка

Потрібен лише [Node.js](https://nodejs.org) 20+.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # тести парсера і статистики на справжніх реплеях
npm run build      # продакшн-збірка в dist/
npm run update-data  # оновити базу танків і мап
```

## Деплой

Кожен пуш у `main` автоматично збирає сайт і публікує його на GitHub Pages (`.github/workflows/deploy.yml`).
Раз на місяць той самий воркфлоу оновлює базу танків і мап і перевикладає сайт.

Перше налаштування: **Settings → Pages → Source: GitHub Actions**.

### Дані танків і мап

Назви, класи й рівні танків та назви мап лежать у `src/data/` і оновлюються щомісяця.

- Базове джерело — [Cufee/aftermath-assets](https://github.com/Cufee/aftermath-assets) (без ліцензії, тож це тимчасове рішення).
- **Офіційний API Wargaming** має пріоритет, якщо задано ключ:
  1. увійти на [developers.wargaming.net](https://developers.wargaming.net/applications/) → *Add application*, тип **Mobile** (без прив'язки до IP);
  2. у репозиторії: **Settings → Secrets and variables → Actions → New repository secret**, назва `WG_APP_ID`, значення — ID застосунку;
  3. **Actions → Deploy → Run workflow**, щоб оновити дані одразу.
- Кілька танків, яким бракує класу в обох джерелах, доповнено вручну з посиланнями на джерела (`CLASS_GAPS` у `src/data/lookup.ts`).

## Подяки

- [roklimovich/wotblitz-replay-analyzer](https://github.com/roklimovich/wotblitz-replay-analyzer) (BlitzScrim) — формула BPR 2.0 та ідея інструмента.
- [eigenein/wotbreplay-parser](https://github.com/eigenein/wotbreplay-parser) — дослідження формату реплеїв; тестові реплеї.
- [Cufee/aftermath-assets](https://github.com/Cufee/aftermath-assets), [Jylpah/blitz-tools](https://github.com/Jylpah/blitz-tools) — дані про танки й мапи.

Фанатський проєкт, не пов'язаний з Wargaming і не схвалений ним. World of Tanks Blitz — торгова марка Wargaming; ігрові дані й назви © Wargaming.net. Логотипи Wargaming не використовуються. Код — MIT, див. [LICENSE](LICENSE).

Картинка для прев'ю посилань: `node scripts/og-image.mjs` → `public/og.png`.
