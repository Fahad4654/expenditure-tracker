# Architecture

## 1. System overview

```text
                    ┌──────────────────────────────────────────────┐
                    │                  Nginx edge                  │
                    │  rate limit · security headers · TLS · routing│
                    └───────┬──────────────────────────┬───────────┘
                            │ /                        │ /api/*, /docs
                            ▼                          ▼
                 ┌─────────────────────┐    ┌──────────────────────────┐
                 │  React + Vite (web) │    │      NestJS (API)        │
                 │  React 19 · Tailwind│    │ REST · OpenAPI · JWT     │
                 └──────────┬──────────┘    └────────────┬─────────────┘
                            │ HTTPS/JSON                 │
                            │                            ▼
                 ┌──────────┴──────────┐    ┌──────────────────────────┐
                 │  Flutter mobile app │    │  Prisma → PostgreSQL     │
                 │  SQLite (offline)   │───▶│  Redis (cache/OTP/rate)  │
                 │  sync queue         │POST│  sync/changes endpoints  │
                 └─────────────────────┘    └──────────────────────────┘
```

Both clients speak the **same REST API**. There is no BFF: the web app calls
`/api/v1/*` directly, and the mobile app calls it through `POST /sync` when
online and directly when online-only features are needed.

### Request lifecycle (web)

1. `lib/api.ts` attaches the bearer access token, echoes the readable CSRF
   cookie on mutating requests, and on a 401 refreshes the session once before
   replaying the call.
2. Nginx applies per-IP/per-route rate limits and security headers.
3. Nest global middleware: Helmet → body-size limit → CORS allow-list.
4. Route-level Zod/class-validator DTO validation.
5. Guard resolves the authenticated user (`JwtAuthGuard`, with `@Public()`
   opting health and auth routes out).
6. Service contains the business logic; repositories/Prisma stay in the data layer.
7. `TransformInterceptor` wraps success as `{ ok: true, data }`;
   `HttpExceptionFilter` wraps failures as `{ ok: false, error }`.

### Request lifecycle (mobile, offline)

1. UI writes the transaction to SQLite **first** and renders it immediately.
2. A `CREATE` operation is appended to `sync_operations` with a client UUID.
3. Connectivity detection triggers the sync engine.
4. Pending operations are batched and `POST /sync`-ed with exponential backoff.
5. The server processes each operation **idempotently** and returns per-operation
   status plus server-side changes the device must download.

---

## 2. Monorepo & shared code

npm workspaces (no Turborepo/Nx — deliberate; see §6):

| Package           | Purpose                                                             |
| ----------------- | ------------------------------------------------------------------- |
| `@exp/types`      | Domain types, enums, route-independent constants, **money helpers** |
| `@exp/validation` | Zod schemas — the _same_ rules run in the browser and on the API    |
| `@exp/config`     | API route map, cookie/storage names, sync tuning, env helpers       |

Each package compiles to `dist/` with `tsc`, so `apps/api` and `apps/web` import
it as an ordinary dependency (no path-mapping or transpile step at runtime).

**Rule:** business logic is never duplicated between web and mobile. Anything
both need (money math, validation, sync vocabulary) lives in `packages/`. Dart
cannot import TypeScript, so the _protocol_ is shared by contract
(`docs/synchronization.md` + `@exp/types`) and mirrored once in Dart.

---

## 3. Backend module layout

```text
apps/api/src/
├── main.ts                    # env load, helmet, CORS, pipes, filters, Swagger
├── app.module.ts              # ConfigModule + PrismaModule + feature modules
├── config/                    # env schema (Zod), typed configuration, env loader
├── prisma/                    # PrismaService (global module)
├── common/
│   ├── filters/               # HttpExceptionFilter → shared error envelope
│   ├── interceptors/          # TransformInterceptor → shared success envelope
│   └── pipes/                 # ZodValidationPipe
├── health/                    # /health/live, /health/ready
├── auth/ users/ transactions/ categories/ reports/   # Phase 2
└── (Phase 5) sync/
```

Each feature module follows: `*.controller.ts` (HTTP only) →
`*.service.ts` (business rules) → `*.repository.ts` (Prisma access, where the
logic warrants one) → `dto/` → `guards/` → `strategies/`. Controllers never
contain business logic.

---

## 4. Cross-cutting decisions

### Response envelope

```jsonc
// success
{ "ok": true, "data": { ... } }

// failure
{ "ok": false, "error": { "code": "VALIDATION_ERROR", "message": "...", "details": [...] } }
```

One interceptor and one exception filter produce these, so clients only ever
branch on `ok` and switch on stable machine-readable `code` values
(`@exp/types` → `API_ERROR_CODES`). Human-readable messages are never parsed.

### Money

PostgreSQL `Decimal(18,2)` → Prisma `Decimal` → JSON **decimal string**
(`"100.50"`). Arithmetic uses integer minor units (`bigint`) in
`@exp/types/money`. No `number` ever touches a monetary value — not for
storage, not for aggregation, not even for display formatting.

### Time & dates

- Instants (`createdAt`, `updatedAt`, `expiresAt`) are `timestamptz` (UTC).
- `transactionDate` is a plain `DATE`. Day bucketing is resolved in the
  **user's** timezone at query time, which removes the classic
  "yesterday/today" off-by-one bug entirely.
- Users carry a configurable `timezone` (default `Asia/Dhaka`); report
  endpoints accept an explicit `timezone` override.

### Identifiers

Every entity uses an application-generated UUID, never auto-increment.
`Transaction.clientId` is generated **on the device before any network I/O**,
which is what makes offline creation and replay safe (see
[synchronization.md](synchronization.md)).

### Data ownership

`userId` is stamped from the verified JWT `sub` on every write and added to
every `WHERE`. There is no endpoint that accepts a `userId` from the client.

---

## 5. Deviations & recommended changes to the original brief

These are deliberate departures (or clarifications) worth reviewing:

1. **Prisma 6, not 7/8.** Prisma 7+ makes driver adapters + an ESM-first
   generated client mandatory, which fights NestJS's CommonJS/decorator build.
   Prisma 6.19 is stable, well-supported and keeps the toolchain boring.
   _Migration path:_ the schema is provider-agnostic; moving to Prisma 7 is a
   mechanical `prisma migrate` + generator change when Nest's ESM story settles.

2. **TypeScript 5.9, not 6/7.** `@nestjs/swagger` declares
   `typescript: ^5.5 || ^6.0`, and `typescript-eslint` declares `<6.1`.
   TS 7 would break both peer ranges.

3. **`transactionDate` is a `DATE`, not a `timestamptz`.** The brief lists
   dates (today/yesterday/month) rather than times-of-day. Storing a date plus
   a user timezone is strictly simpler and correct; adding a time-of-day column
   later is additive.

4. **`ChangeLog` table added (not in the brief).** `GET /sync/changes` needs a
   total, stable order of server-side changes. A monotonic `BigInt` cursor is
   simpler and race-free than comparing `updatedAt` timestamps (which tie).
   This is the "latest synchronization cursor/version" the brief asks for.

5. **`SyncOperation` is persisted server-side.** The brief requires the server
   to "safely process the same operation more than once". A unique
   `(userId, operationId)` constraint is the only reliable way to enforce that
   under concurrency — a pure in-memory de-dup would not survive a restart.

6. **`Device` table.** Needed so changes can be routed _away_ from the device
   that produced them, and so each device keeps its own pull cursor.

7. **Auth transport was decided in Phase 1 and implemented in Phase 2:** bearer access
   token (15 min) in memory/localStorage on the web + rotating refresh token in
   an HTTP-only, `SameSite=Lax` cookie, protected by a double-submit CSRF
   cookie. This avoids putting the short-lived token where JS can read it on
   every request while keeping CSRF out of the way of `GET`s.

8. **Redis is provisioned but not yet wired.** It becomes load-bearing in
   Phase 6 (rate limiting, OTP storage, refresh-token denylist). Adding a
   client in Phase 1 would be speculative code.

9. **No GraphQL.** The brief specifies REST + OpenAPI; offline sync is a
   batch-REST problem, and REST keeps the mobile client trivial.

10. **No Turborepo/Nx.** Three workspaces and a `concurrently` script cover the
    need; a task graph would be machinery without a payoff at this size.

---

## 6. Why the boring choices

| Decision                  | Reason                                                                               |
| ------------------------- | ------------------------------------------------------------------------------------ |
| npm workspaces            | Ships with npm; zero extra tooling                                                   |
| Zod in a shared package   | One source of truth for validation; the browser can pre-validate before a round-trip |
| REST + envelope           | Trivial to reason about, trivial to test, easy to cache                              |
| UUID PKs                  | Required for offline-first sync; no ID negotiation round-trip                        |
| Soft delete (`deletedAt`) | Sync needs tombstones; "deletes must not accidentally disappear"                     |
| Monolith API (modular)    | One deployable, clear module boundaries; can be split later if needed                |
| Nginx edge                | Rate limits and headers enforced even if an app instance misbehaves                  |

---

## 7. Planned module map (Phases 2–5)

```text
auth/         register, login, refresh rotation, logout      ✅ Phase 2
users/        profile read/update, timezone & currency        ✅ Phase 2
transactions/ CRUD + search + filter + pagination             ✅ Phase 2
categories/   system + user categories                        ✅ Phase 2
reports/      summary, daily, monthly, category breakdown     ✅ Phase 2
health/       liveness + readiness                            ✅ Phase 1
sync/         POST /sync, GET /sync/changes                   Phase 5
otp, Google OAuth, password reset                             Phase 6
```
