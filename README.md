# TradeSim — симулятор трейдера

Учебная игра: $10 000 виртуального капитала, 8 вымышленных активов, свечные графики, новости,
плечо и ликвидации. Версия 2 добавляет аккаунты, облачные сохранения и **честные рейтинги**:
результат каждой рейтинговой партии сервер пересчитывает сам, повторяя её на том же движке.

> ⚠ Игра учебная, все данные вымышлены. Не является финансовой рекомендацией.

## Монорепозиторий

```
trader-sim/
├─ apps/
│  ├─ web/        фронтенд: Vite + React 18 + TanStack Query + zustand + i18next
│  └─ api/        бэкенд: Fastify + Prisma/PostgreSQL + zod + argon2id + JWT
├─ packages/
│  ├─ engine/     чистый детерминированный движок (рынок, новости, торговля, достижения, реплей)
│  └─ shared/     контракт API: zod-схемы, DTO-типы, коды ошибок, константы
├─ docker-compose.yml        postgres · redis (профиль) · mailpit · api · web (nginx)
├─ .github/workflows/ci.yml  lint · format · i18n · typecheck · test · build · docker
└─ tsconfig.base.json, package.json (npm workspaces)
```

`packages/engine` не обращается к `window`, `localStorage`, DOM, `Date.now()` и `Math.random()`:
время и случайность приходят только параметрами (seed, номер тика, время старта). ESLint
запрещает эти глобалы в движке, а его тесты идут в чистом Node.

## Быстрый старт

### Всё в Docker

```bash
cp .env.example .env        # задайте JWT_SECRET и DAILY_SEED_SECRET
docker compose up -d --build   # миграции применяются автоматически при старте api
```

- игра: http://localhost:8080 (nginx проксирует `/api` → api)
- Swagger UI: http://localhost:3000/docs
- письма (подтверждение, сброс пароля): Mailpit http://localhost:8025
- кэш рейтингов в Redis: `LEADERBOARD_CACHE=redis docker compose --profile redis up -d`

Демо-данные (12 игроков с партиями, которые прошли тот же реплей, что и настоящие):

```bash
npm ci && npm run db:generate -w @trader-sim/api
DATABASE_URL=postgresql://tradesim:tradesim@localhost:5432/tradesim npm run db:seed
```

Логин любого демо-игрока: `<nickname>@demo.tradesim.local` / `demo-password-123`.

### Локальная разработка

```bash
npm install
cp .env.example .env
docker compose up -d postgres mailpit     # или без Docker: npm run db:embedded -w @trader-sim/api
npm run db:migrate
npm run db:seed
npm run dev                               # api :3000 + web :5173 (Vite проксирует /api)
```

Без Docker: `npm run db:embedded -w @trader-sim/api` поднимает встроенный PostgreSQL на порту 54330. Тогда в `.env` укажите
`DATABASE_URL=postgresql://tradesim:tradesim@127.0.0.1:54330/tradesim`, а `SMTP_HOST` оставьте
пустым — письма будут печататься в лог API.

| Скрипт (из корня)    | Что делает                                                              |
| -------------------- | ----------------------------------------------------------------------- |
| `npm run dev`        | api и web одновременно                                                  |
| `npm run build`      | сборка всех пакетов (api → `apps/api/dist`, web → `apps/web/dist`)      |
| `npm test`           | тесты engine, shared, api (на реальном Postgres) и web                  |
| `npm run lint`       | ESLint по всему репозиторию, 0 предупреждений                           |
| `npm run typecheck`  | `tsc` во всех пакетах                                                   |
| `npm run db:migrate` | `prisma migrate deploy`                                                 |
| `npm run db:seed`    | демо-игроки, партии, рейтинги, дружба, ежедневный челлендж              |
| `npm run i18n:check` | одинаковые ключи, формы множественного числа и плейсхолдеры в 6 локалях |

**База для тестов API.** Если задан `TEST_DATABASE_URL`, тесты используют его (в CI это сервис
Postgres; локально `docker compose --profile test up -d postgres-test` →
`postgresql://test:test@localhost:5433/tradesim_test`). Если не задан, global setup сам запускает
встроенный PostgreSQL. Перед прогоном применяются миграции.

## API

Ошибки всегда приходят в одном формате `{ "error": { "code": "…", "message": "…" } }`; клиент
переводит их по `code`. Полная схема — `GET /docs` (OpenAPI генерируется из тех же zod-схем, что и
валидация).

| Метод и путь                                                              | Доступ          | Назначение                                                               |
| ------------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------ |
| `GET /health`                                                             | —               | состояние, БД, Redis, версия движка                                      |
| `POST /auth/register`                                                     | —               | регистрация (+ импорт гостевого прогресса)                               |
| `POST /auth/login`                                                        | —               | вход по e-mail и паролю                                                  |
| `POST /auth/refresh`                                                      | cookie + CSRF   | ротация refresh-токена, новый access JWT                                 |
| `POST /auth/logout`                                                       | cookie + CSRF   | выход с этого устройства                                                 |
| `POST /auth/logout-all`                                                   | JWT             | отзыв всех сессий                                                        |
| `POST /auth/verify-email`                                                 | —               | подтверждение e-mail по токену из письма                                 |
| `POST /auth/resend-verification`                                          | JWT             | отправить письмо ещё раз                                                 |
| `POST /auth/forgot-password`                                              | —               | письмо со ссылкой сброса (ответ одинаковый для любых e-mail)             |
| `POST /auth/reset-password`                                               | —               | новый пароль, отзыв всех сессий                                          |
| `GET /auth/providers`                                                     | —               | включённые OAuth-провайдеры                                              |
| `GET /auth/oauth/:provider/start`, `…/callback`                           | —               | вход через Google / GitHub (за флагом конфигурации)                      |
| `GET /me`, `PATCH /me`                                                    | JWT             | мой аккаунт (ник, аватар, язык, тема)                                    |
| `PATCH /me/privacy`                                                       | JWT             | скрыть профиль из рейтингов                                              |
| `GET /me/settings`, `PUT /me/settings`                                    | JWT             | облачные настройки с версией (409 `VERSION_CONFLICT`)                    |
| `GET /me/progress`                                                        | JWT             | XP, уровень, достижения                                                  |
| `POST /me/import-guest`                                                   | JWT             | привязать локальный прогресс гостя                                       |
| `GET /me/export`, `DELETE /me`                                            | JWT             | выгрузка данных (GDPR) и удаление аккаунта                               |
| `GET /users/:nickname`                                                    | —/JWT           | публичный профиль                                                        |
| `POST /runs`                                                              | JWT             | начать партию (`standard` / `daily`), сервер выдаёт seed и конфиг        |
| `GET /runs/active`, `GET /runs/:id`                                       | JWT             | активная / своя партия                                                   |
| `POST /runs/:id/actions`                                                  | JWT             | чекпоинт журнала действий                                                |
| `POST /runs/:id/finish`                                                   | JWT             | завершение: серверный реплей и итог                                      |
| `POST /runs/:id/abandon`                                                  | JWT             | бросить партию                                                           |
| `GET /leaderboards/:type`                                                 | —/JWT           | `?period=all\|week\|season\|daily\|friends&season=&date=&cursor=&limit=` |
| `GET /leaderboards/:type/me`                                              | JWT             | моя позиция и по 2 соседа выше и ниже                                    |
| `GET /seasons`                                                            | —               | текущий сезон и архив                                                    |
| `GET /daily`                                                              | —/JWT           | ежедневный челлендж: таймер, участники, мой результат и место            |
| `GET /friends`, `GET /friends/requests`                                   | JWT             | друзья и заявки                                                          |
| `POST /friends/requests`                                                  | JWT             | заявка по нику (встречная заявка принимается сразу)                      |
| `POST /friends/requests/:id/accept\|decline`, `DELETE /friends/:nickname` | JWT             | ответ на заявку, удаление                                                |
| `GET /admin/runs/flagged`, `POST /admin/runs/:id/approve`                 | `x-admin-token` | модерация подозрительных партий                                          |

Типы `:type`: `equity` (итоговый капитал), `roi`, `bestTrade`, `streak` (серия прибыльных сделок),
`risk` (прибыль с поправкой на просадку, как коэффициент Шарпа). Пагинация — keyset-курсор
(значение, время, id), поэтому страницы стабильны, даже пока таблица меняется.

## Безопасность

- Пароли — argon2id (19 MiB, t=2). Для несуществующих e-mail тоже считается хеш, чтобы время
  ответа не выдавало зарегистрированные адреса.
- Access JWT живёт 15 минут и хранится только в памяти вкладки. Refresh-токен (30 дней) лежит в
  cookie `httpOnly; SameSite=Lax; Secure` с путём `/api/auth`, а в БД хранится только его SHA-256.
- Каждый refresh выдаёт новый токен. Повторное предъявление уже заменённого токена считается кражей
  и отзывает всю цепочку. Исключение — повтор в течение 30 секунд: так бывает, когда две вкладки
  обновляются одновременно.
- CSRF: эндпоинты, работающие по cookie, требуют заголовок `x-csrf-token`, равный cookie `ts_csrf`
  (double-submit).
- Rate limit на auth, партии и заявки в друзья; helmet; CORS по белому списку; лимит размера тела
  запроса; IDOR — чужая партия неотличима от несуществующей (404).
- Секреты задаются только через `.env` (см. `.env.example`).

## Anti-cheat: как сервер проверяет партию

```
клиент                                       сервер
  │ POST /runs ───────────────────────────────▶ seed (crypto), startTime, версия движка,
  │◀────────────────────── конфиг партии ───── лимиты; одна активная партия на игрока
  │
  │ играет локально на packages/engine:
  │ createSession(seed, startTime) → stepSession() каждый тик
  │ каждое действие → { tick, type, payload } в журнал (переживает офлайн)
  │
  │ POST /runs/:id/actions (каждые 15 с) ─────▶ проверки: тики не убывают, в пределах партии,
  │                                              ≤ 5 действий за тик, ≤ 5000 за партию,
  │                                              темп ≤ 5 тиков в реальную секунду (+ запас)
  │ POST /runs/:id/finish ────────────────────▶ replayRun(конфиг, журнал, finalTick)
  │   { finalTick, engineVersion,                на серверной копии движка → итоговый капитал,
  │     clientSummary }                          ROI, серия побед, риск-скор, достижения
  │◀──────────── результат, рассчитанный сервером
```

Результат, присланный клиентом, в расчёт не идёт — он используется только для сравнения.
Партия получает флаги и **не попадает в рейтинг до ручной проверки**, если:

- `CLIENT_MISMATCH` — капитал клиента отличается от серверного больше чем на 1e-6 (относительно);
- `REJECTED_ACTIONS` — реплей отверг действия (не хватает средств, несуществующие позиции и т.п.);
- `UNREALISTIC_GROWTH` — ROI больше 500 %.

Если версия движка не совпадает (`ENGINE_VERSION_MISMATCH`), партия засчитывается в профиль, но
не в рейтинг. Незавершённые партии истекают через 24 часа, ежедневная — в конце дня по UTC.
Модератор может одобрить партию через `POST /admin/runs/:id/approve`: сервер повторит реплей и
засчитает результат.

**Ограничение модели.** Рынок генерируется на клиенте, поэтому seed известен игроку, и
теоретически он может заранее просчитать будущие цены. Лимит темпа и проверки делают это
неудобным, но не невозможным. Полная защита требует, чтобы сервер стримил цены тик за тиком, —
это следующий шаг, если рейтинг станет соревновательным.

**Детерминизм** подтверждают тесты: `packages/engine/src/session/session.test.ts` (один seed и
один журнал всегда дают один результат), `apps/api/test/runs.test.ts` (партия, сыгранная тем же
кодом, что и в браузере, принимается, а подделанная — нет) и живая проверка в браузере (капитал
клиента и сервера совпал до последнего бита).

## Как добавить новый тип рейтинга

1. `packages/shared/src/schemas/leaderboards.ts` — добавьте значение в `LEADERBOARD_TYPES`
   (например, `'trades'`).
2. `apps/api/prisma/schema.prisma` — добавьте значение в enum `LeaderboardMetric` (например,
   `TRADES`) и создайте миграцию: `npm run db:migrate:dev -w @trader-sim/api -- --name lb_trades`.
3. `apps/api/src/modules/leaderboards/metrics.ts` — привяжите тип к enum и к значению из
   `RunSummary`, например `trades: { db: 'TRADES', value: (s) => s.totalTrades || null }`.
   `null` означает «в этот рейтинг не писать». Если нужного значения в `RunSummary` нет, сначала
   добавьте его в `summarizeSession` в `packages/engine` — тогда его тоже посчитает серверный реплей.
4. `apps/web/src/features/leaderboard/formatValue.ts` — задайте формат отображения.
5. Добавьте переводы `online.types.<type>` и `online.typeHints.<type>` во все 6 локалей
   (`npm run i18n:check`; тест `i18n.test.ts` проверит, что все типы переведены).

Вкладки, пагинация, «моя позиция» и Redis-кэш подхватят новый тип автоматически. Уже сыгранные
партии в новый рейтинг не попадут; чтобы заполнить его задним числом, прогоните `replayRun` по
сохранённым журналам (`RunAction`).

## Синхронизация и офлайн

- **Настройки** (язык, тема, звук, скорость) синхронизируются с `version` и `updatedAt`. При
  конфликте сервер отвечает 409 со своей копией, и побеждает более свежее изменение.
- **Рейтинговая партия** пишет действия в постоянную очередь (`localStorage`). Без сети игра
  продолжается; чекпоинты и `finish` отправляются, как только сеть появится (событие `online`).
- **Гость** играет полностью локально, как в версии 1. При регистрации локальный XP (до 500) и
  достижения можно привязать к аккаунту. Они помечаются как импортированные и в рейтинг не идут.

## Фронтенд: что нового

`features/auth` (вход, регистрация, сброс пароля, подтверждение e-mail, OAuth),
`features/leaderboard` (вкладки глобальный, неделя, сезон, день, друзья; 5 метрик; моя позиция),
`features/daily-challenge`, `features/friends`, `features/profile` (публичный профиль, приватность,
экспорт, удаление аккаунта), `features/ranked` (старт, чекпоинты, офлайн-очередь, итоги).

API-клиент (`apps/web/src/api`) типизирован схемами из `@trader-sim/shared` и сам обновляет токен
при 401 (один запрос на все параллельные). Ошибки переводятся по коду (`apiErrors.*`). У каждого
экрана есть состояния загрузки (skeleton), ошибки с повтором и пустого списка; экраны проверены
в светлой, тёмной и терминальной темах и на ширине 375 px.

## Расширение игры

### Новый актив

1. Добавьте запись в `packages/engine/src/market/assets.ts` и поднимите `ENGINE_VERSION` в
   `packages/engine/src/session/session.ts`: рынок изменится, и старые партии не должны смешиваться
   с новыми в рейтинге.
2. Добавьте `assets.<ID>.name` во все `apps/web/src/i18n/locales/*.json`.
3. Новая категория: тип `AssetCategory` (`packages/engine/src/types.ts`), `categories.<category>` в
   локалях, шаблоны новостей в `packages/engine/src/news/templates.ts`.

### Новый язык

1. Скопируйте `apps/web/src/i18n/locales/en.json` в `<code>.json` и переведите значения.
2. Формы множественного числа задаются по `Intl.PluralRules('<code>')`; `npm run i18n:check`
   подскажет недостающие.
3. Зарегистрируйте язык в `apps/web/src/i18n/index.ts` (`resources`, `SUPPORTED_LANGUAGES`) и в
   `SUPPORTED_LOCALES` в `packages/shared/src/constants.ts` (для облачной синхронизации).
4. Добавьте `settings.languages.<code>` во все локали.

### Новая тема

1. Скопируйте блок `[data-theme='dark']` в `apps/web/src/theme/themes.css` под новым именем.
2. Добавьте имя в `ThemeName` (`apps/web/src/types/index.ts`), в `THEMES`
   (`apps/web/src/theme/themes.ts`), в `META_COLORS` (`ThemeProvider.tsx`) и в `THEME_PREFERENCES`
   (`packages/shared/src/constants.ts`).
3. Добавьте `settings.themes.<name>` во все локали.

## Горячие клавиши

`B` — купить / лонг · `S` — продать / шорт · `Пробел` — пауза. Работают по физической клавише,
то есть и на русской раскладке.
