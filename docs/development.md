# Development

## Prerequisites

| Tool             | Version                  | Notes                        |
| ---------------- | ------------------------ | ---------------------------- |
| Node.js          | ≥ 22.18 (24 recommended) | `node -v`                    |
| npm              | ≥ 11                     | ships with Node 24           |
| Docker + Compose | v2                       | for the database/redis stack |
| PostgreSQL       | 16                       | or use the Docker stack      |
| Flutter          | ≥ 3.44                   | mobile only                  |
| Redis            | 7                        | optional until Phase 6       |

---

## First run

```bash
npm install

cp .env.example .env
#   → set DATABASE_URL, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET

npm run db:generate     # Prisma client
npm run db:migrate      # create/apply migrations
npm run db:seed         # 11 system categories

npm run dev             # API :4000 + Web :3000, both in watch mode
```

Sanity checks:

```bash
curl http://localhost:4000/api/v1/health/ready   # postgres "up"
open http://localhost:3000                        # web app
open http://localhost:4000/docs                   # Swagger
```

### Docker alternative

```bash
docker compose up --build
```

Brings up `postgres`, `redis`, `api` (watch) and `web` (watch). Source is
bind-mounted; dependencies live in named volumes. Reset with:

```bash
docker compose down -v && docker compose up --build
```

### Mobile

```bash
cd apps/mobile
flutter pub get

# Android emulator → host machine
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:4000
```

---

## Everyday commands

| Command                           | Purpose                                         |
| --------------------------------- | ----------------------------------------------- |
| `npm run dev`                     | API + Web in watch mode (builds packages first) |
| `npm run build`                   | Full production build of everything             |
| `npm run typecheck`               | Strict TS across all workspaces                 |
| `npm run lint`                    | ESLint                                          |
| `npm test`                        | Vitest (API, web client, shared money math)     |
| `npm run format`                  | Prettier write                                  |
| `npm run db:migrate`              | New migration (dev)                             |
| `npm run db:deploy`               | Apply pending migrations (CI/prod)              |
| `npm run db:seed`                 | Idempotent system categories                    |
| `npm run db:studio`               | Prisma Studio                                   |
| `flutter analyze && flutter test` | Mobile                                          |

---

## Repository conventions

### Layout

- `apps/api` — NestJS. Modules: `controllers → services → repositories → DTOs`.
  Business logic never lives in a controller.
- `apps/web` — React 19 + Vite, client-rendered with React Router. Route paths
  live in `src/routes.ts`; `src/lib/api.ts` is the single HTTP entry point.
- `apps/mobile` — Flutter. Feature folders under `lib/features/`, infrastructure
  under `lib/core/`.
- `packages/*` — anything both web and API need. Never duplicate logic.

### Code rules (applied on every PR)

1. Strict TypeScript; `any` is a lint error.
2. Validate every external input with a shared Zod schema.
3. Never trust a client-supplied user id — take it from the JWT.
4. Never use floating point for money; use `@exp/types` money helpers.
5. Handle errors explicitly; never swallow an exception.
6. Add indexes with any new query path.
7. Write tests for business-critical behaviour.
8. Inspect existing architecture before adding a new abstraction.

### Naming & style

- Prettier (repo-root `.prettierrc`) — 2-space, single quotes, trailing commas.
- Files: `kebab-case.ts`; React components `PascalCase.tsx`.
- DTOs: `*Input` / `*Query` suffixes; Zod schemas `*Schema`.
- Env vars: `SCREAMING_SNAKE_CASE`, declared once in
  `apps/api/src/config/env.validation.ts`.

### Environment variables

One `.env` at the repo root. Loaded deterministically:

1. Variables already in `process.env` (Docker/CI) always win.
2. `apps/api/.env` (optional workspace overrides).
3. Repo-root `.env`.

`process.loadEnvFile` never overwrites existing keys, so container-injected
secrets are safe. Vite reads the same file through `envDir` in
`apps/web/vite.config.ts`, so `VITE_*` keys are inlined into the client bundle —
`VITE_API_URL` is the only one, and it must never hold a secret.

Gotcha: the root `.env` sets `NODE_ENV=development` for the API, and Vite loads
`NODE_ENV` regardless of the `VITE_` prefix. The web `build` script therefore
pins `NODE_ENV=production` so a local build ships React's production build.

---

## Testing

```bash
npm test                                  # all Node workspaces
npm test --workspace @exp/api             # API only
npm test --workspace @exp/web             # web client only
npm test --workspace @exp/types           # money math
cd apps/mobile && flutter test            # mobile
```

Current coverage — 112 tests, all DB-free (`PrismaService` is mocked, so the
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
- `packages/types/test/money.spec.ts` — decimal↔minor-unit round trips,
  exactness beyond `Number.MAX_SAFE_INTEGER`, formatting.

An external smoke suite (`/tmp/opencode/smoke.py`, not committed) exercises the
same routes against a live PostgreSQL — 55 checks covering envelopes, cookie
flags, CSRF, rotation/reuse, cross-user 404s, idempotent creates and report
totals.

Remaining test debt: sync idempotency and conflict tests (Phase 5), rate
limiter tests (Phase 6), and Flutter/widget tests for the mobile app.

**Tests must not require secrets.** `vitest.config.mts` loads the root `.env`
if present, but nothing depends on it.

---

## Phase plan & status

| Phase                        | Scope                                                                                                                                | Status      |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------- |
| **1 — Architecture**         | Monorepo, TypeScript, NestJS, React/Vite, Flutter, Docker, PostgreSQL, Prisma, initial schema & docs                                 | ✅ **Done** |
| **2 — Database + Backend**   | Prisma schema refinements, migrations, User/Category/Transaction, auth foundation, authorization, transaction & category CRUD, tests | ✅ **Done** |
| **3 — Web application**      | Auth UI, dashboard, transactions, categories, reports, profile/settings                                                              | ✅ **Done** |
| **4 — Mobile application**   | Flutter architecture, auth, SQLite, transactions, dashboard, reports, categories (online-first)                                      | ⬜          |
| **5 — Offline-first**        | Local persistence, sync queue, connectivity, `/sync`, retry, idempotency, conflicts, sync status UI                                  | ⬜          |
| **6 — Production hardening** | Rate limits, headers, logging, monitoring, indexes, perf, backups, prod Docker/Nginx, CI/CD                                          | ⬜          |

### Delivered in Phase 1

- npm-workspace monorepo with `apps/`, `packages/`, `infrastructure/`, `docs/`
- `@exp/types`, `@exp/validation`, `@exp/config` (built to `dist/`)
- NestJS 12 API: config validation, Prisma, health endpoints, global envelope
  interceptor + exception filter, Helmet, CORS allow-list, Swagger
- React 19 + Vite 8 app: Tailwind 4, React Router route manifest, PWA
  manifest, landing page that reports live API health
- Flutter app: theming, compile-time config, planned screen map
- Prisma schema: 10 tables, full index set, initial migration applied & seeded
- `docker-compose.yml` (dev) and `docker-compose.prod.yml` (nginx edge →
  nginx-served static bundle + API)
- Nginx configs validated with `nginx -t`, web image built and smoke-tested
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

## Troubleshooting

| Symptom                                                                   | Fix                                                                                |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `Missing required environment variable "DATABASE_URL"`                    | `cp .env.example .env`                                                             |
| Prisma `P1012` schema validation error                                    | `npx prisma validate --schema apps/api/prisma/schema.prisma`                       |
| Migration `P3018` (type mismatch)                                         | Fix the schema, delete `apps/api/prisma/migrations/*`, re-run `npm run db:migrate` |
| "applied to the database but missing from the local migrations directory" | `npx prisma migrate reset --force --schema apps/api/prisma/schema.prisma`          |
| Web cannot reach the API                                                  | Check `VITE_API_URL` and `CORS_ORIGINS`                                            |
| `@exp/*` import fails                                                     | `npm run build:packages`                                                           |
| Port already in use                                                       | `API_PORT` / `WEB_PORT` in `.env`                                                  |
| Mobile sees connection refused on Android                                 | Use `http://10.0.2.2:4000`, not `localhost`                                        |
