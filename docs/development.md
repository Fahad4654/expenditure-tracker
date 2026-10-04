# Development

## Prerequisites

| Tool       | Version                  | Notes                  |
| ---------- | ------------------------ | ---------------------- |
| Node.js    | ≥ 24.15 (or ≥ 22.22.3)  | `node -v`              |
| npm        | ≥ 11                     | ships with Node 24     |
| PostgreSQL | 16                       | local install          |
| Flutter    | ≥ 3.44                   | mobile only            |
| Redis      | 7                        | optional until Phase 6 |

---

## First run

The frontend and backend are **fully independent npm projects** — no root
`package.json`, no shared `node_modules`, no common commands. Install and run
each app from its own directory:

```bash
# API (:4000)
cd apps/api
npm install
cp .env.example .env       # → set DATABASE_URL, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET
npm run db:generate        # Prisma client
npm run db:migrate         # create/apply migrations
npm run db:seed            # system categories + demo users
npm run dev                # watch mode

# Web (:3000) — second terminal
cd apps/web
npm install
cp .env.example .env       # → API base URL + dev port seen by the browser
npm run dev                # watch mode
```

Each app has its own copy of the shared modules under `src/shared/`, so
editing one app's copy does not touch the other — keep the two copies
mirrored.

Demo users (seeded only when `NODE_ENV` is not `production`):
`demo@example.com`, `alice@example.com`, `bob@example.com` — password
`Password123!`.

Sanity checks:

```bash
curl http://localhost:4000/api/v1/health/ready   # postgres "up"
open http://localhost:3000                        # web app
open http://localhost:4000/docs                   # Swagger
```

### Mobile

```bash
cd apps/mobile
flutter pub get

# Android emulator → host machine
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:4000
```

Google sign-in (mobile) needs the Firebase Android config at
`apps/mobile/android/app/google-services.json` (Firebase console → Project
settings → Your apps → Android, package `com.kaife.expendituretracker`).
Without it the app runs fine and the Google button simply reports that sign-in
is unavailable — the API verifies ID tokens against Google's public JWKS, so
no service-account key belongs anywhere in this repository.

---

## Everyday commands

Every command runs **from inside its app directory**:

### `apps/api`

| Command                | Purpose                                 |
| ---------------------- | --------------------------------------- |
| `npm run dev`          | NestJS watch mode (:4000)               |
| `npm run build`        | Production build (`dist/`)              |
| `npm run typecheck`    | Strict TypeScript check                 |
| `npm run lint`         | ESLint                                  |
| `npm test`             | Vitest (75 tests, incl. money math)     |
| `npm run format`       | Prettier write                          |
| `npm run db:migrate`   | New migration (dev)                     |
| `npm run db:deploy`    | Apply pending migrations (CI/prod)      |
| `npm run db:seed`      | Seed categories + demo users            |
| `npm run db:studio`    | Prisma Studio                           |

### `apps/web`

| Command             | Purpose                             |
| ------------------- | ----------------------------------- |
| `npm run dev`       | Vite dev server (:3000)             |
| `npm run build`     | Production build (`dist/`)          |
| `npm run preview`   | Serve the production build          |
| `npm run typecheck` | Strict TypeScript check             |
| `npm run lint`      | ESLint                              |
| `npm test`          | Vitest (47 tests)                   |
| `npm run format`    | Prettier write                      |

### `apps/mobile`

| Command                           | Purpose |
| --------------------------------- | ------- |
| `flutter run`                     | Run     |
| `flutter analyze && flutter test` | Checks |
| `LIVE_API=1 flutter test test/live_api_smoke_test.dart` | Live API smoke (API on :4000) |
| `JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64 flutter build apk --debug` | Build APK (JDK 17+) |

---

## Repository conventions

### Layout

- `apps/api` — NestJS. Modules: `controllers → services → repositories → DTOs`.
  Business logic never lives in a controller.
- `apps/web` — React 19 + Vite, client-rendered with React Router. Route paths
  live in `src/routes.ts`; `src/lib/api.ts` is the single HTTP entry point.
- `apps/mobile` — Flutter. Feature folders under `lib/features/`, infrastructure
  under `lib/core/`.
- `src/shared/` (per app) — `types`, `validation`, `config`. Deliberately
  duplicated: mirror every change in both apps.

### Code rules (applied on every PR)

1. Strict TypeScript; `any` is a lint error.
2. Validate every external input with a shared Zod schema.
3. Never trust a client-supplied user id — take it from the JWT.
4. Never use floating point for money; use the money helpers in `src/shared/types`.
5. Handle errors explicitly; never swallow an exception.
6. Add indexes with any new query path.
7. Write tests for business-critical behaviour.
8. Inspect existing architecture before adding a new abstraction.

### Naming & style

- Prettier (`.prettierrc` in each app directory) — 2-space, single quotes,
  trailing commas. Run `npm run format` from within the app.
- Files: `kebab-case.ts`; React components `PascalCase.tsx`.
- DTOs: `*Input` / `*Query` suffixes; Zod schemas `*Schema`.
- Env vars: `SCREAMING_SNAKE_CASE`, declared once in
  `apps/api/src/config/env.validation.ts`.

### Environment variables

Two env files, one per app — neither is ever committed:

| File            | Loaded by                              | Contents                                                                  |
| --------------- | -------------------------------------- | ------------------------------------------------------------------------- |
| `apps/api/.env` | `loadApiEnv()` in `config/load-env.ts` | API config, `DATABASE_URL`, JWT secrets, OTP settings, SMTP, Firebase      |
| `apps/web/.env` | Vite (default `envDir`)                | `VITE_API_URL` (same-site with the page host preferred, not required), `VITE_FIREBASE_*` (Google sign-in), `WEB_PORT` — no secrets |

For the API, variables already in `process.env` (shell/CI) always win;
`process.loadEnvFile` never overwrites existing keys, so secrets injected
through the environment are safe. The path is resolved relative to the config
module, so the file is found no matter which directory the process starts
from.

Only `VITE_*` keys are inlined into the client bundle — `VITE_API_URL` and
the `VITE_FIREBASE_*` set (public Firebase web config; the Google button hides
itself while they are unset) — and none of them may hold a secret. `WEB_PORT`
sets the dev/preview port. The web `build` script pins `NODE_ENV=production` so a local build always
ships React's production build.

---

## Testing

```bash
cd apps/api && npm test                   # API (125 tests)
cd apps/web && npm test                   # web client (62 tests)
cd apps/mobile && flutter test            # mobile (83 tests)
```

Current coverage — 270 tests, all DB-free (`PrismaService` is mocked, so the
suite runs without infrastructure or secrets):

- `apps/api/test/health.spec.ts` — success/error envelopes, readiness failure
  path, 404 contract.
- `apps/api/test/utils.spec.ts` — TTL parsing, timezone-aware date ranges,
  UTC-midnight Prisma bounds, money aggregation above `2^53`.
- `apps/api/test/guards.spec.ts` — `JwtAuthGuard` (bearer parsing, `@Public()`
  bypass, no user id from the request) and `CookieCsrfGuard` double-submit.
- `apps/api/test/auth.spec.ts` — register/login, identical wrong-email and
  wrong-password errors, dummy-hash timing path, lockout thresholds, refresh
  rotation and family revocation on reuse, idempotent logout.
- `apps/api/test/resources.spec.ts` — category ownership rules, system-category
  guard, in-use conflict, `clientId` idempotency, `baseVersion` conflict,
  tombstone deletes, listing bounds.
- `apps/api/test/notes_reminders.spec.ts` — note/reminder ownership (foreign id
  → 404), soft deletes, `version` bumps, date-only `dueDate` conversion, the
  `completed` toggle setting `completedAt`.
- `apps/web/src/lib/api.test.ts` — envelope unwrapping, `ApiError` mapping,
  bearer-token handling (jsdom, `fetch` stubbed).
- `apps/web/src/lib/api.csrf.test.ts` — CSRF double-submit header, query
  serialization, silent-refresh replay, the one-replay cap and the auth-path
  retry exclusions.
- `apps/web/src/lib/useAsync.test.ts` — loading/success/error transitions,
  dep-key re-fetching with stale data retained, `reload()` and optimistic
  `setData()`.
- `apps/web/src/auth/auth.test.tsx` — silent refresh on mount, login/logout
  state transitions, route guards and the `state.from` redirect payload.
- `apps/web/src/pages/LoginPage.test.tsx` — client-side validation short-circuits
  the network call, rejected credentials surface the server message, and a
  successful sign-in reaches its destination.
- `apps/web/src/routes.test.ts` — route manifest shape and id encoding.
- `apps/mobile/test/formatters_test.dart` — money parsing, minor-unit exactness
  beyond 2^53, date/list formatters.
- `apps/mobile/test/auth_flow_test.dart` + `widget_test.dart` — boot routing
  (signed-in vs. login), login/register validation, invalid credentials
  surfacing, tab navigation.
- `apps/mobile/test/transactions_test.dart` + `dashboard_test.dart` — add-form
  validation, idempotent `clientId` create, list/detail/edit flows, dashboard
  summaries.
- `apps/mobile/test/live_api_smoke_test.dart` — opt-in (`LIVE_API=1`) round
  trip through the real API: register → categories → create → idempotent
  replay → **sync push (queue drained, server id adopted, cursor stored)** →
  reports → delete → logout → revoked refresh rejection.
- `apps/mobile/test/local_store_test.dart` + `local_reports_test.dart` —
  SQLite schema/migrations, local-first writes, queue + metadata durability
  across reopen, local SQL report summaries/trends/categories.
- `apps/mobile/test/sync_engine_test.dart` — the `POST /sync` +
  `GET /sync/changes` protocol: adoption, `DUPLICATE`, `CONFLICT`,
  partial `REJECTED`, network-failure backoff, cursor-less bootstrap pull +
  paging, tombstones, connectivity gating, sign-in kick, `syncNow` re-arm.
- `apps/mobile/test/sync_ui_test.dart` — pending/failed sync chips on
  transaction tiles and the Profile sync card (queue count, "Sync now").
- `apps/api/src/shared/types/money.spec.ts` + the web copy (`money.test.ts`)
  — decimal↔minor-unit round trips,
  exactness beyond `Number.MAX_SAFE_INTEGER`, formatting.

An external smoke suite (`/tmp/opencode/smoke.py`, not committed) exercises the
same routes against a live PostgreSQL — 55 checks covering envelopes, cookie
flags, CSRF, rotation/reuse, cross-user 404s, idempotent creates and report
totals.

Remaining test debt: rate limiter tests (Phase 6).

**Tests must not require secrets.** `vitest.config.mts` loads `apps/api/.env`
if present, but nothing depends on it.

---

## Phase plan & status

| Phase                        | Scope                                                                                                                                | Status      |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------- |
| **1 — Architecture**         | Monorepo, TypeScript, NestJS, React/Vite, Flutter, PostgreSQL, Prisma, initial schema & docs                                         | ✅ **Done** |
| **2 — Database + Backend**   | Prisma schema refinements, migrations, User/Category/Transaction, auth foundation, authorization, transaction & category CRUD, tests | ✅ **Done** |
| **3 — Web application**      | Auth UI, dashboard, transactions, categories, reports, profile/settings                                                              | ✅ **Done** |
| **4 — Mobile application**   | Flutter architecture, auth, transactions, dashboard, reports, categories, profile (online-first)                                   | ✅ **Done** |
| **5 — Offline-first**        | Local persistence, sync queue, connectivity, `/sync`, retry, idempotency, conflicts, sync status UI                                  | ✅ **Done** |
| **6 — Production hardening** | Rate limits, headers, logging, monitoring, indexes, perf, backups, production deployment, CI/CD                                      | ⬜          |

### Delivered in Phase 1

- Independent apps under `apps/` (each with its own npm project and lockfile),
  docs under `docs/`
- Per-app shared modules under `apps/*/src/shared/` (`types`, `validation`, `config`)
- NestJS 12 API: config validation, Prisma, health endpoints, global envelope
  interceptor + exception filter, Helmet, CORS allow-list, Swagger
- React 19 + Vite 8 app: Tailwind 4, React Router route manifest, PWA
  manifest, landing page that reports live API health
- Flutter app: theming, compile-time config, planned screen map
- Prisma schema: 10 tables, full index set, initial migration applied & seeded
- Docs: architecture, database, api, authentication, synchronization,
  development, deployment
- `typecheck` · `lint` · `test` all green (26 tests)

---

### Delivered in Phase 2

- **Auth foundation:** Argon2id hashing (`@node-rs/argon2`), JWT access tokens,
  rotating refresh tokens stored as SHA-256 hashes with family revocation on
  reuse, HTTP-only refresh cookie + double-submit CSRF, login lockout
  (`LOGIN_MAX_FAILED_ATTEMPTS` / `LOGIN_LOCKOUT_SECONDS`).
- **Authorization:** global `JwtAuthGuard` with `@Public()` opt-out; `sub` from
  the verified token is the only source of user id. Another user's rows are
  **404**, never 403.
- **Users:** `GET`/`PATCH /users/me`, plus per-user timezone/currency defaults
  that drive every date-range query.
- **Categories:** list/create/update/delete with system-category protection
  (403) and in-use conflict (409).
- **Transactions:** CRUD with `clientId` idempotency (201 vs 200 replay),
  `baseVersion` optimistic concurrency (409), tombstone soft deletes, search,
  filters, sorting and pagination.
- **Reports:** summary, daily, monthly and category breakdowns, each evaluated
  in the caller's timezone and echoing the resolved range.
- **Error contract:** `apiError()` factory with stable `code`s; validation
  failures carry `details[].path` as `body.<field>` / `params.<field>` /
  `query.<field>`.
- **Tests:** 65 new API tests (87 total across the monorepo), all DB-free.
- `typecheck` · `lint` · `test` · `build` · `prettier --check` all green.

---

### Delivered in Phase 3

- **Session:** `AuthProvider` performs a silent refresh on first paint, owns
  `login`/`register`/`logout`/`setUser`, and registers the `apiFetch` 401
  handler so an expired access token is refreshed once and replayed.
- **Guards:** `ProtectedRoute` (spinner while the refresh settles, then a
  redirect carrying `state.from`) and `GuestOnlyRoute` for the auth screens.
- **Forms:** shared `TransactionForm` validates with the same Zod schema the API
  applies; server `details[].path` values are mapped back onto the fields.
- **Pages:** dashboard (today/month summary, recent activity, top categories),
  transaction list with debounced search/type/category/period filters and
  pagination, create/detail/edit/delete, categories (create, rename, delete),
  reports (summary, daily/monthly charts, category breakdown), and settings
  (name, timezone, default currency).
- **Deferred honestly:** `/forgot-password`, `/verify-email` and
  `/verify-phone` render an explanation instead of a 404 — the backing routes
  exist in the manifest but no mail or SMS provider is wired up.
- **Tests:** 25 new web tests (112 total across the monorepo).
- `typecheck` · `lint` · `test` · `build` · `prettier --check` all green.

---

### Delivered in Phase 4

- **Network layer:** `HttpApiClient` unwraps the `{ok,data}` envelope, maps
  error envelopes to `ApiError` (stable `code` + `details[]`), injects the
  bearer token, and refreshes once on 401 with a single-flight lock and
  request replay; `TokenStore` persists only the refresh token (secure
  storage in production, in-memory backend in tests).
- **Repositories:** `Auth`, `Transactions`, `Categories`, `Reports`, `Users`,
  `Reminders` mirroring the web client's contracts, including `clientId`
  idempotency and `baseVersion` optimistic concurrency. Reminders are
  network-only (the table is not in the sync feed).
- **Auth flow:** splash restores the session (refresh → shell) or lands on
  login; login/register validate client-side and surface the server's
  message; logout revokes and clears tokens.
- **Shell:** bottom navigation (Home, Transactions, Reports, Reminders,
  Profile) with a central "Add" FAB, lazy tab creation, and a shared
  `ValueNotifier` so a new transaction refreshes both the dashboard and the
  list.
- **Pages:** dashboard (today/month summaries, spending-by-category bars,
  recent activity), transactions (search/type/category/preset filters,
  add/edit/detail/delete with 409 conflict handling), categories
  (create/edit/archive with system-category and in-use errors), reports
  (summary, daily/monthly/category charts), reminders (pending/completed
  filters, overdue/due-today chips, create/edit with date + optional `HH:mm`
  time pickers, completion toggle, delete), profile (details, defaults,
  change password, sign out).
- **Platform:** `INTERNET` permission + cleartext for local dev on Android,
  local-network allowance on iOS; builds on `minSdk 24`.
- **Tests:** 91 mobile tests (291 total across the monorepo) plus an opt-in
  live-API smoke test (`LIVE_API=1`).
- `flutter analyze` · `flutter test` · `flutter build apk --debug` all green.

---

### Delivered: Notes & Reminders

- **Schema:** `Note` (title + optional content) and `Reminder` (title,
  optional details, date-only `dueDate`, optional `HH:mm` `dueTime`,
  `completedAt` toggle) — both user-owned, soft-deleted, `version`-bumped,
  migrated in `20261003204811_add_notes_reminders` and
  `20261004101813_add_reminder_time`.
- **API:** `GET/POST /notes`, `PATCH/DELETE /notes/:id`, `GET/POST /reminders`,
  `PATCH/DELETE /reminders/:id` behind `JwtAuthGuard`; shared Zod schemas and
  route constants live in `shared/{validation,types}` and are mirrored into
  `apps/web`. Every mutation calls `logEvent` (`NOTE_*` / `REMINDER_*`
  audit lines).
- **Web:** `/notes` and `/reminders` pages with sidebar links — search, inline
  create/edit/delete with confirm panels, pending-first reminder ordering with
  overdue chips, optional time picker (`CustomTimePicker`, two-click `HH:mm`
  commit), single-PATCH completion toggle; responsive auto-fit grids
  throughout.
- **Mobile:** Reminders tab in the shell — pending/completed filters,
  overdue/due-today/time chips, network-only `RemindersRepository`, and a
  shared create/edit form with date + optional time pickers and delete.
- **Tests:** `notes_reminders.spec.ts` (API, 16 tests) plus
  `NotesPage.test.tsx` (4) and `RemindersPage.test.tsx` (5) on the web and
  `reminders_test.dart` (mobile, 7).

## Troubleshooting

| Symptom                                                                   | Fix                                                                                |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `Missing required environment variable "DATABASE_URL"`                    | `cp apps/api/.env.example apps/api/.env`                                           |
| Prisma `P1012` schema validation error                                    | `cd apps/api && npm run db:validate`                                               |
| Migration `P3018` (type mismatch)                                         | Fix the schema, delete `apps/api/prisma/migrations/*`, re-run `npm run db:migrate` |
| "applied to the database but missing from the local migrations directory" | `cd apps/api && npm run db:reset`                                                  |
| Web cannot reach the API                                                  | Check `VITE_API_URL` and `CORS_ORIGINS`                                            |
| Signed out after ~15 min of inactivity                                    | Reload the page — the session refreshes from the stored token (body transport), so cookie loss alone cannot log you out; a logout means the stored refresh token is gone (cleared storage) → sign in again |
| Port already in use                                                       | `API_PORT` in `apps/api/.env`, `WEB_PORT` in `apps/web/.env`                       |
| Mobile sees connection refused on Android                                 | Use `http://10.0.2.2:4000`, not `localhost`                                        |
